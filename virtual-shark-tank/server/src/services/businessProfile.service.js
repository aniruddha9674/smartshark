import { eq, and } from "drizzle-orm";
import { db } from "../config/db.postgres.js";
import {
  users,
  businessProfiles,
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

// ---------- Read ----------
export const getBusinessProfile = async (userId) => {
  const profile = await db.query.businessProfiles.findFirst({
    where: eq(businessProfiles.userId, userId),
  });

  if (!profile) throw ApiError.notFound("Business profile not found");
  return profile;
};

// ---------- Update (with audit) ----------
export const updateBusinessProfile = async (userId, editorId, changes) => {
  const current = await db.query.businessProfiles.findFirst({
    where: eq(businessProfiles.userId, userId),
  });

  if (!current) throw ApiError.notFound("Business profile not found");

  // Diff — only record fields whose value actually changed
  const auditRows = [];
  const updates = {};

  for (const [field, newValue] of Object.entries(changes)) {
    const oldValue = current[field];
    const oldStr = oldValue == null ? null : String(oldValue);
    const newStr = newValue == null ? null : String(newValue);

    if (oldStr !== newStr) {
      updates[field] = newValue;
      auditRows.push({
        businessId: userId,
        editedById: editorId,
        fieldName: field,
        oldValue: oldStr,
        newValue: newStr,
        fieldType: FIELD_TYPES[field] || "string",
      });
    }
  }

  // No actual changes — return current state, no writes
  if (auditRows.length === 0) return current;

  // Profile update + audit rows must succeed or fail together
  return await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(businessProfiles)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(businessProfiles.userId, userId))
      .returning();

    await tx.insert(profileEditHistory).values(auditRows);

    return updated;
  });
};

// ---------- Complete profile ----------
export const completeBusinessProfile = async (userId) => {
  const profile = await db.query.businessProfiles.findFirst({
    where: eq(businessProfiles.userId, userId),
  });

  if (!profile) throw ApiError.notFound("Business profile not found");

  // Which required fields are missing or null?
  const missing = REQUIRED_PROFILE_FIELDS.filter((field) => {
    const value = profile[field];
    return value === null || value === undefined || value === "";
  });

  if (missing.length > 0) {
    throw ApiError.badRequest("Profile incomplete", { missingFields: missing });
  }

  // Idempotent — calling twice is fine
  await db
    .update(users)
    .set({ isProfileComplete: true, updatedAt: new Date() })
    .where(eq(users.id, userId));

  return { isProfileComplete: true };
};

// ---------- Edit history ----------
export const getBusinessProfileHistory = async (userId, limit = 50) => {
  return await db.query.profileEditHistory.findMany({
    where: eq(profileEditHistory.businessId, userId),
    orderBy: (h, { desc }) => [desc(h.changedAt)],
    limit,
  });
};