import { eq, and } from "drizzle-orm";
import { db } from "../config/db.postgres.js";
import { businesses,profileEditHistory } from "../models/postgres/index.js";
import { Verification } from "../models/mongo/verification.model.js";
import { extractFromDocument } from "./extraction.service.js";
import { ApiError } from "../utils/apiError.js";
import * as eventService from "./event.service.js";

const assertBusinessOwnership = async (businessId, userId) => {
  const [business] = await db
    .select()
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);

  if (!business) throw ApiError.notFound("Business not found");
  if (business.ownerId !== userId) {
    throw ApiError.forbidden("You do not own this business");
  }
  return business;
};

/**
 * Create a verification and run extraction.
 * Synchronous for MVP — user waits ~3-5s for OCR.
 */
export const createVerification = async ({
  userId,
  businessId,
  documentType,
  documentUrl,
  publicId,
}) => {
  await assertBusinessOwnership(businessId, userId);

  const verification = await Verification.create({
    userId,
    businessId,
    documentType,
    documentUrl,
    publicId: publicId || null,
    status: "pending",
  });

  await eventService.log({
    userId,
    eventType: "verification_started",
    entityType: "verification",
    entityId: verification._id.toString(),
    metadata: { businessId, documentType },
  });

  try {
    const { fields, overallConfidence, wrongDocument } =
      await extractFromDocument(documentUrl, documentType);

    if (wrongDocument) {
      verification.status = "rejected";
      verification.errorMessage = "Document type does not match selection";
      verification.confidenceScore = 0;

      await eventService.log({
        userId,
        eventType: "verification_failed",
        entityType: "verification",
        entityId: verification._id.toString(),
        metadata: { businessId, documentType, reason: "wrong_document" },
      });
    } else {
      verification.ocrExtractedData = fields;
      verification.confidenceScore = overallConfidence;
      verification.status =
        overallConfidence >= 0.7 ? "verified" : "needs_review";

      await eventService.log({
        userId,
        eventType: "verification_extracted",
        entityType: "verification",
        entityId: verification._id.toString(),
        metadata: {
          businessId,
          documentType,
          overallConfidence,
          status: verification.status,
        },
      });
    }
  } catch (err) {
    verification.status = "needs_review";
    verification.errorMessage = err.message;

    await eventService.log({
      userId,
      eventType: "verification_failed",
      entityType: "verification",
      entityId: verification._id.toString(),
      metadata: { businessId, documentType, reason: err.message },
    });
  }

  await verification.save();
  return verification;
};

export const listMyVerifications = async (userId, { businessId } = {}) => {
  const query = { userId };
  if (businessId) query.businessId = businessId;
  return Verification.find(query).sort({ createdAt: -1 }).lean();
};

export const getVerification = async (id, userId) => {
  const verification = await Verification.findById(id).lean();
  if (!verification) throw ApiError.notFound("Verification not found");
  if (verification.userId !== userId) {
    throw ApiError.forbidden("Not your verification");
  }
  return verification;
};

// ═══════════════════════════════════════════════════════════════
// FIELD MAPPING — OCR field → profile column, per document type
// ═══════════════════════════════════════════════════════════════
const FIELD_MAP = {
  udyam: {
    enterprise_name: "companyName",
    udyam_registration_number: "udyamNumber",
  },
  gst: {
    legal_name: "companyName",
    gstin: "gstNumber",
  },
  shop_act: {
    establishment_name: "companyName",
    certificate_number: "shopActLicense",
  },
};

const getFieldValue = (ocrData, fieldName) => {
  if (!ocrData) return null;
  if (ocrData instanceof Map) {
    return ocrData.get(fieldName)?.value ?? null;
  }
  return ocrData[fieldName]?.value ?? null;
};

const extractProfileFields = (verification) => {
  const map = FIELD_MAP[verification.documentType];
  if (!map) return {};

  const result = {};
  for (const [ocrField, profileField] of Object.entries(map)) {
    const value = getFieldValue(verification.ocrExtractedData, ocrField);
    if (value !== null && value !== undefined && value !== "") {
      result[profileField] = value;
    }
  }
  return result;
};

// ═══════════════════════════════════════════════════════════════
// CROSS-DOCUMENT CONSISTENCY + TIER
// ═══════════════════════════════════════════════════════════════
/**
 * unverified → no verified docs
 * basic     → 1+ verified primary doc
 * verified  → 2+ verified docs that AGREE on companyName
 */
const computeVerificationTier = async (businessId, includeVerificationId) => {
  const all = await Verification.find({
    businessId,
    status: { $in: ["verified", "pending"] },
  }).lean();

  const relevant = all.filter(
    (v) =>
      v._id.toString() === includeVerificationId || v.status === "verified"
  );

  if (relevant.length === 0) return "unverified";

  const names = relevant
    .map((v) => {
      const map = FIELD_MAP[v.documentType];
      if (!map) return null;
      for (const [ocrField, profileField] of Object.entries(map)) {
        if (profileField === "companyName") {
          return getFieldValue(v.ocrExtractedData, ocrField);
        }
      }
      return null;
    })
    .filter(Boolean)
    .map((n) => String(n).toLowerCase().trim());

  const uniqueNames = new Set(names);

  if (relevant.length >= 2 && uniqueNames.size === 1) return "verified";
  if (relevant.length >= 1) return "basic";
  return "unverified";
};

// ═══════════════════════════════════════════════════════════════
// APPLY TO PROFILE
// ═══════════════════════════════════════════════════════════════
export const applyToBusinessProfile = async (
  verificationId,
  userId,
  confirmedFields = {}
) => {
  const verification = await Verification.findById(verificationId);
  if (!verification) throw ApiError.notFound("Verification not found");
  if (verification.userId !== userId) {
    throw ApiError.forbidden("Not your verification");
  }
  if (verification.status === "rejected") {
    throw ApiError.badRequest("Cannot apply a rejected verification");
  }

  const business = await assertBusinessOwnership(
    verification.businessId,
    userId
  );

  // Merge OCR output with user-confirmed overrides (confirmed wins)
  const ocrFields = extractProfileFields(verification);
  const candidates = { ...ocrFields, ...confirmedFields };

  // Compute diffs
  const updates = {};
  const conflicts = [];
  const historyEntries = [];

  for (const [field, newValue] of Object.entries(candidates)) {
    if (newValue === null || newValue === undefined || newValue === "") continue;

    const currentValue = business[field];
    const isEmpty =
      currentValue === null || currentValue === undefined || currentValue === "";

    if (isEmpty) {
      updates[field] = newValue;
      historyEntries.push({
        businessId: business.id,
        editedById: userId,
        fieldName: field,
        oldValue: null,
        newValue: String(newValue),
        fieldType: typeof newValue === "number" ? "number" : "string",
      });
    } else if (String(currentValue) !== String(newValue)) {
      conflicts.push({ field, currentValue, extractedValue: newValue });
    }
  }

  // Apply updates + audit trail in one transaction
  let updatedBusiness = business;
  if (Object.keys(updates).length > 0) {
    updatedBusiness = await db.transaction(async (tx) => {
      const [b] = await tx
        .update(businesses)
        .set(updates)
        .where(eq(businesses.id, business.id))
        .returning();

      await tx.insert(profileEditHistory).values(historyEntries);
      return b;
    });
  }

  // Mark verification as applied (Mongo — outside the Postgres transaction)
  verification.appliedFields = Object.keys(updates);
  verification.status = "verified";
  verification.reviewedAt = new Date();
  await verification.save();

    // After verification.save() and after the tier update:
  await eventService.log({
    userId,
    eventType: "verification_applied",
    entityType: "verification",
    entityId: verification._id.toString(),
    metadata: {
      businessId: business.id,
      documentType: verification.documentType,
      appliedFields: Object.keys(updates),
      conflictCount: conflicts.length,
    },
  });
  
  
  // Compute new tier (reads all verifications for this business)
  const newTier = await computeVerificationTier(
    business.id,
    verification._id.toString()
  );

  if (newTier !== updatedBusiness.verificationTier) {
    const [b] = await db
      .update(businesses)
      .set({ verificationTier: newTier })
      .where(eq(businesses.id, business.id))
      .returning();
    updatedBusiness = b;

    await eventService.log({
      userId,
      eventType: "verification_tier_changed",
      entityType: "business",
      entityId: business.id,
      metadata: {
        from: business.verificationTier,
        to: newTier,
      },
    });
  }

  return {
    business: updatedBusiness,
    newTier,
    appliedFields: Object.keys(updates),
    conflicts,
  };

};