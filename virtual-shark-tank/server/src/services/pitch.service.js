import { eq, and, desc, sql } from "drizzle-orm";
import { db } from "../config/db.postgres.js";
import { pitches, businesses } from "../models/postgres/index.js";
import { ApiError } from "../utils/apiError.js";
import { REQUIRED_TO_PUBLISH } from "../validators/pitch.validator.js";

// ---------- Helpers ----------
const computeValuation = (askAmount, equityOffered) => {
  const ask = Number(askAmount);
  const equity = Number(equityOffered);
  return (ask / (equity / 100)).toFixed(2);
};

// Verify the user owns the business that owns this pitch
const assertPitchOwnership = async (pitch, userId) => {
  const business = await db.query.businesses.findFirst({
    where: eq(businesses.id, pitch.businessId),
    columns: { id: true, ownerId: true, isProfileComplete: true },
  });
  if (!business || business.ownerId !== userId) {
    throw ApiError.forbidden("You do not own this pitch");
  }
  return business;
};

// ---------- Create draft ----------
export const createPitch = async (businessId, userId, data) => {
  const business = await db.query.businesses.findFirst({
    where: eq(businesses.id, businessId),
    columns: { id: true, ownerId: true },
  });
  if (!business) throw ApiError.notFound("Business not found");
  if (business.ownerId !== userId) {
    throw ApiError.forbidden("You do not own this business");
  }

  const { askAmount, equityOffered, ...rest } = data;

  const [pitch] = await db
    .insert(pitches)
    .values({
      businessId,
      ...rest,
      askAmount: String(askAmount),
      equityOffered: String(equityOffered),
      valuation: computeValuation(askAmount, equityOffered),
      status: "draft",
    })
    .returning();

  return pitch;
};

// ---------- List my pitches for a business ----------
export const getMyPitches = async (businessId, userId) => {
  const business = await db.query.businesses.findFirst({
    where: eq(businesses.id, businessId),
    columns: { ownerId: true },
  });
  if (!business) throw ApiError.notFound("Business not found");
  if (business.ownerId !== userId) {
    throw ApiError.forbidden("You do not own this business");
  }

  return await db.query.pitches.findMany({
    where: eq(pitches.businessId, businessId),
    orderBy: [desc(pitches.createdAt)],
  });
};

// ---------- Get one pitch ----------
export const getPitch = async (pitchId, requestingUserId) => {
  const pitch = await db.query.pitches.findFirst({
    where: eq(pitches.id, pitchId),
  });
  if (!pitch) throw ApiError.notFound("Pitch not found");

  const business = await db.query.businesses.findFirst({
    where: eq(businesses.id, pitch.businessId),
    columns: { ownerId: true },
  });
  const isOwner = business?.ownerId === requestingUserId;

  // Owner sees any status. Everyone else only sees live pitches.
  if (!isOwner && pitch.status !== "live") {
    throw ApiError.notFound("Pitch not found");
  }

  return pitch;
};

// ---------- Update draft ----------
export const updatePitch = async (pitchId, userId, changes) => {
  const pitch = await db.query.pitches.findFirst({
    where: eq(pitches.id, pitchId),
  });
  if (!pitch) throw ApiError.notFound("Pitch not found");

  await assertPitchOwnership(pitch, userId);

  if (pitch.status !== "draft") {
    throw ApiError.badRequest(`Cannot edit a ${pitch.status} pitch`);
  }

  // Recompute valuation if ask or equity changed
  let valuation = pitch.valuation;
  if (changes.askAmount != null || changes.equityOffered != null) {
    const nextAsk = changes.askAmount ?? pitch.askAmount;
    const nextEquity = changes.equityOffered ?? pitch.equityOffered;
    valuation = computeValuation(nextAsk, nextEquity);
  }

  const updates = { ...changes, valuation };

  if (updates.askAmount != null) updates.askAmount = String(updates.askAmount);
  if (updates.equityOffered != null) updates.equityOffered = String(updates.equityOffered);
  if (updates.monthlyGrowthPct != null) updates.monthlyGrowthPct = String(updates.monthlyGrowthPct);

  const [updated] = await db
    .update(pitches)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(pitches.id, pitchId))
    .returning();

  return updated;
};

// ---------- Publish ----------
export const publishPitch = async (pitchId, userId) => {
  const pitch = await db.query.pitches.findFirst({
    where: eq(pitches.id, pitchId),
  });
  if (!pitch) throw ApiError.notFound("Pitch not found");

  const business = await assertPitchOwnership(pitch, userId);

  if (pitch.status !== "draft") {
    throw ApiError.badRequest(`Cannot publish a ${pitch.status} pitch`);
  }

  // 1. Business profile must be complete
  if (!business.isProfileComplete) {
    throw ApiError.badRequest(
      "Complete your business profile before publishing a pitch"
    );
  }

  // 2. Required fields must be present
  const missing = REQUIRED_TO_PUBLISH.filter((field) => {
    const value = pitch[field];
    return value === null || value === undefined || value === "";
  });
  if (missing.length > 0) {
    throw ApiError.badRequest("Pitch is incomplete", { missingFields: missing });
  }

  // 3. No other live pitch for this business
  const existingLive = await db.query.pitches.findFirst({
    where: and(
      eq(pitches.businessId, pitch.businessId),
      eq(pitches.status, "live")
    ),
  });
  if (existingLive) {
    throw ApiError.conflict(
      "This business already has a live pitch. Close it before publishing a new one."
    );
  }

  const [updated] = await db
    .update(pitches)
    .set({
      status: "live",
      publishedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(pitches.id, pitchId))
    .returning();

  return updated;
};

// ---------- Close ----------
export const closePitch = async (pitchId, userId) => {
  const pitch = await db.query.pitches.findFirst({
    where: eq(pitches.id, pitchId),
  });
  if (!pitch) throw ApiError.notFound("Pitch not found");

  await assertPitchOwnership(pitch, userId);

  if (pitch.status !== "live") {
    throw ApiError.badRequest(`Cannot close a ${pitch.status} pitch`);
  }

  const [updated] = await db
    .update(pitches)
    .set({
      status: "closed",
      closedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(pitches.id, pitchId))
    .returning();

  return updated;
};

// ---------- Delete draft ----------
export const deletePitch = async (pitchId, userId) => {
  const pitch = await db.query.pitches.findFirst({
    where: eq(pitches.id, pitchId),
  });
  if (!pitch) throw ApiError.notFound("Pitch not found");

  await assertPitchOwnership(pitch, userId);

  if (pitch.status !== "draft") {
    throw ApiError.badRequest("Only draft pitches can be deleted");
  }

  await db.delete(pitches).where(eq(pitches.id, pitchId));
  return { deleted: true };
};

// ---------- List live pitches (investor feed) ----------
export const listLivePitches = async (filters = {}) => {
  const { stage, revenueRange, businessId, limit = 50, offset = 0 } = filters;

  const conditions = [eq(pitches.status, "live")];
  if (stage) conditions.push(eq(pitches.stage, stage));
  if (revenueRange) conditions.push(eq(pitches.revenueRange, revenueRange));
  if (businessId) conditions.push(eq(pitches.businessId, businessId));

  return await db.query.pitches.findMany({
    where: and(...conditions),
    orderBy: [desc(pitches.publishedAt)],
    limit: Math.min(Number(limit), 100),
    offset: Number(offset),
  });
};