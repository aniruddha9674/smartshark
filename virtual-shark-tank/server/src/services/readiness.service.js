import { eq, desc, gte, and } from "drizzle-orm";
import { db } from "../config/db.postgres.js";
import { businesses, readinessScores } from "../models/postgres/index.js";
import { ApiError } from "../utils/apiError.js";

const MODEL_VERSION = "rules-v1";

// ─── Ownership ─────────────────────────────────────────────────
const assertOwnership = async (businessId, userId) => {
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

// ─── Feature vector ────────────────────────────────────────────
const PROFILE_FIELDS = [
  "companyName",
  "sector",
  "city",
  "description",
  "fundingAsk",
  "yearsOperating",
];
const DOC_FIELDS = ["udyamNumber", "gstNumber", "shopActLicense"];

const computeFeatureVector = (business) => {
  const features = {};

  // 1. Profile completeness — 5 pts per filled field, 6 fields → 30 max
  const filledCount = PROFILE_FIELDS.filter((f) => {
    const v = business[f];
    return v !== null && v !== undefined && v !== "";
  }).length;
  features.profileCompleteness = {
    value: filledCount,
    contribution: filledCount * 5,
    maxContribution: 30,
  };

  // 2. Documents — 5 pts per doc number → 15 max
  const docsPresent = DOC_FIELDS.filter((d) => business[d]).length;
  features.documents = {
    value: docsPresent,
    contribution: docsPresent * 5,
    maxContribution: 15,
  };

  // 3. Verification tier — 0 / 7 / 15
  const tierPoints = { unverified: 0, basic: 7, verified: 15 };
  const tier = business.verificationTier || "unverified";
  features.verificationTier = {
    value: tier,
    contribution: tierPoints[tier] ?? 0,
    maxContribution: 15,
  };

  // 4. Description depth — 0 / 5 / 10
  const descLen = (business.description || "").length;
  const descPoints = descLen >= 100 ? 10 : descLen >= 50 ? 5 : 0;
  features.descriptionDepth = {
    value: descLen,
    contribution: descPoints,
    maxContribution: 10,
  };

  // 5. Years operating — 1 pt per year, capped at 10
  const years = business.yearsOperating || 0;
  features.yearsOperating = {
    value: years,
    contribution: Math.min(years, 10),
    maxContribution: 10,
  };

  // 6. Funding ask — set = 10
  features.fundingAsk = {
    value: business.fundingAsk ? Number(business.fundingAsk) : null,
    contribution: business.fundingAsk ? 10 : 0,
    maxContribution: 10,
  };

  // 7. Profile marked complete — 10
  features.profileComplete = {
    value: business.isProfileComplete,
    contribution: business.isProfileComplete ? 10 : 0,
    maxContribution: 10,
  };

  return features;
};

// ─── Template-based suggestions (no LLM) ───────────────────────
const TEMPLATES = {
  profileCompleteness: (f) =>
    `Fill ${6 - f.value} more profile field${6 - f.value === 1 ? "" : "s"} — up to ${f.maxContribution - f.contribution} points`,

  documents: (f) =>
    `Add ${3 - f.value} more registration number${3 - f.value === 1 ? "" : "s"} (Udyam, GST, or Shop Act) — up to ${f.maxContribution - f.contribution} points`,

  verificationTier: (f) =>
    `Verify a business document to raise your tier — +${f.maxContribution - f.contribution} points`,

  descriptionDepth: (f) =>
    `Expand your business description to 100+ characters — +${f.maxContribution - f.contribution} points`,

  yearsOperating: (f) =>
    `Confirm ${f.maxContribution - f.contribution} more year${f.maxContribution - f.contribution === 1 ? "" : "s"} of operation — +${f.maxContribution - f.contribution} points`,

  fundingAsk: () => `Set a funding ask amount — +10 points`,

  profileComplete: () => `Mark your profile as complete — +10 points`,
};

const buildSuggestions = (breakdown) =>
  breakdown
    .filter((f) => f.contribution < f.maxContribution)
    .sort(
      (a, b) =>
        b.maxContribution -
        b.contribution -
        (a.maxContribution - a.contribution)
    )
    .slice(0, 3)
    .map((f) => TEMPLATES[f.feature]?.(f))
    .filter(Boolean);

// ─── Public API ────────────────────────────────────────────────
export const computeReadiness = async (businessId, userId) => {
  const business = await assertOwnership(businessId, userId);

  const features = computeFeatureVector(business);

  const breakdown = Object.entries(features).map(([feature, data]) => ({
    feature,
    value: data.value,
    contribution: data.contribution,
    maxContribution: data.maxContribution,
  }));

  const score = Math.round(
    breakdown.reduce((sum, f) => sum + f.contribution, 0)
  );

  const suggestions = buildSuggestions(breakdown);

  const [row] = await db
    .insert(readinessScores)
    .values({
      businessId,
      score,
      modelVersion: MODEL_VERSION,
      shapBreakdown: breakdown,
      suggestions,
      sector: business.sector || null,
      stage: null,
      computedAt: new Date(),
    })
    .returning();

  return row;
};

export const getLatestReadiness = async (businessId, userId) => {
  await assertOwnership(businessId, userId);

  const [row] = await db
    .select()
    .from(readinessScores)
    .where(eq(readinessScores.businessId, businessId))
    .orderBy(desc(readinessScores.computedAt))
    .limit(1);

  return row || null;
};

export const getReadinessTrend = async (businessId, userId, days = 30) => {
  await assertOwnership(businessId, userId);

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  return db
    .select()
    .from(readinessScores)
    .where(
      and(
        eq(readinessScores.businessId, businessId),
        gte(readinessScores.computedAt, since)
      )
    )
    .orderBy(readinessScores.computedAt);
};