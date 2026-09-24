import { eq, and } from "drizzle-orm";
import { db } from "../config/db.postgres.js";
import {
  businesses,
  profileEditHistory,
} from "../models/postgres/index.js";
import { ApiError } from "../utils/apiError.js";
import { REQUIRED_PROFILE_FIELDS } from "../validators/businessProfile.validator.js";

// ---- Field type hints for the audit log ----
const FIELD_TYPES = {
  companyName: "string",
  sector: "string",
  city: "string",
  description: "text",
  fundingAsk: "currency",
  yearsOperating: "number",
  udyamNumber: "string",
  gstNumber: "string",
  shopActLicense: "string",
};

// ---------- Ownership guard ----------
const assertOwnership = async (businessId, userId) => {
  const business = await db.query.businesses.findFirst({
    where: eq(businesses.id, businessId),
    columns: { id: true, ownerId: true },
  });
  if (!business) throw ApiError.notFound("Business not found");
  if (business.ownerId !== userId) {
    throw ApiError.forbidden("You do not own this business");
  }
  return business;
};

// ---------- Read one ----------
export const getBusiness = async (businessId, userId) => {
  await assertOwnership(businessId, userId);
  const business = await db.query.businesses.findFirst({
    where: eq(businesses.id, businessId),
  });
  return business;
};

// ---------- List my businesses ----------
export const listMyBusinesses = async (userId) => {
  return await db.query.businesses.findMany({
    where: eq(businesses.ownerId, userId),
    orderBy: (b, { desc }) => [desc(b.createdAt)],
  });
};

// ---------- Create ----------
export const createBusiness = async (userId, data) => {
  const [business] = await db
    .insert(businesses)
    .values({
      ownerId: userId,
      ...data,
    })
    .returning();
  return business;
};

// ---------- Update (with audit) ----------
export const updateBusiness = async (businessId, userId, changes) => {
  await assertOwnership(businessId, userId);

  const current = await db.query.businesses.findFirst({
    where: eq(businesses.id, businessId),
  });

  const auditRows = [];
  const updates = {};

  for (const [field, newValue] of Object.entries(changes)) {
    const oldValue = current[field];
    const oldStr = oldValue == null ? null : String(oldValue);
    const newStr = newValue == null ? null : String(newValue);

    if (oldStr !== newStr) {
      updates[field] = newValue;
      auditRows.push({
        businessId,
        editedById: userId,
        fieldName: field,
        oldValue: oldStr,
        newValue: newStr,
        fieldType: FIELD_TYPES[field] || "string",
      });
    }
  }

  if (auditRows.length === 0) return current;

  return await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(businesses)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(businesses.id, businessId))
      .returning();

    await tx.insert(profileEditHistory).values(auditRows);

    return updated;
  });
};

// ---------- Complete profile ----------
export const completeBusiness = async (businessId, userId) => {
  await assertOwnership(businessId, userId);

  const business = await db.query.businesses.findFirst({
    where: eq(businesses.id, businessId),
  });

  const missing = REQUIRED_PROFILE_FIELDS.filter((field) => {
    const value = business[field];
    return value === null || value === undefined || value === "";
  });

  if (missing.length > 0) {
    throw ApiError.badRequest("Profile incomplete", { missingFields: missing });
  }

  await db
    .update(businesses)
    .set({ isProfileComplete: true, updatedAt: new Date() })
    .where(eq(businesses.id, businessId));

  return { isProfileComplete: true };
};

// ---------- Edit history ----------
export const getBusinessHistory = async (businessId, userId, limit = 50) => {
  await assertOwnership(businessId, userId);

  return await db.query.profileEditHistory.findMany({
    where: eq(profileEditHistory.businessId, businessId),
    orderBy: (h, { desc }) => [desc(h.changedAt)],
    limit,
  });
};