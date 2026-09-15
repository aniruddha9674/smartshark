import { eq } from "drizzle-orm";
import { db } from "../config/db.postgres.js";
import { users, investorProfiles } from "../models/postgres/index.js";
import { ApiError } from "../utils/apiError.js";
import { REQUIRED_INVESTOR_FIELDS } from "../validators/investorProfile.validator.js";

// ---------- Read ----------
export const getInvestorProfile = async (userId) => {
  const profile = await db.query.investorProfiles.findFirst({
    where: eq(investorProfiles.userId, userId),
  });

  if (!profile) throw ApiError.notFound("Investor profile not found");
  return profile;
};

// ---------- Update ----------
export const updateInvestorProfile = async (userId, changes) => {
  const current = await db.query.investorProfiles.findFirst({
    where: eq(investorProfiles.userId, userId),
  });

  if (!current) throw ApiError.notFound("Investor profile not found");

  // Cross-field check across DB + payload
  const nextMin = changes.minTicketSize ?? current.minTicketSize;
  const nextMax = changes.maxTicketSize ?? current.maxTicketSize;

  if (nextMin != null && nextMax != null) {
    if (Number(nextMin) > Number(nextMax)) {
      throw ApiError.badRequest(
        "minTicketSize must be less than or equal to maxTicketSize"
      );
    }
  }

  const updates = {};
  for (const [field, value] of Object.entries(changes)) {
    updates[field] = value;
  }

  const [updated] = await db
    .update(investorProfiles)
    .set({ ...updates })
    .where(eq(investorProfiles.userId, userId))
    .returning();

  return updated;
};

// ---------- Complete profile ----------
export const completeInvestorProfile = async (userId) => {
  const profile = await db.query.investorProfiles.findFirst({
    where: eq(investorProfiles.userId, userId),
  });

  if (!profile) throw ApiError.notFound("Investor profile not found");

  const missing = REQUIRED_INVESTOR_FIELDS.filter((field) => {
    const value = profile[field];
    return value === null || value === undefined || value === "";
  });

  if (missing.length > 0) {
    throw ApiError.badRequest("Profile incomplete", { missingFields: missing });
  }

  await db
    .update(users)
    .set({ isProfileComplete: true, updatedAt: new Date() })
    .where(eq(users.id, userId));

  return { isProfileComplete: true };
};