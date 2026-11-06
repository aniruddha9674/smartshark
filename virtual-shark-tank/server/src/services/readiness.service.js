import { eq, desc, gte, and } from "drizzle-orm";
import { db } from "../config/db.postgres.js";
import { businesses, readinessScores } from "../models/postgres/index.js";
import { ApiError } from "../utils/apiError.js";

const MODEL_VERSION = "rules-v1";

// ─── Ownership (used by route-facing wrappers only) ───────────
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

// ─── Feature table (sums to 100 at verified tier) ─────────────
const FEATURES = [
  { key: "companyName",       label: "Company name",       weight: 5,  test: (b) => !!b.companyName },
  { key: "sector",            label: "Sector",             weight: 5,  test: (b) => !!b.sector },
  { key: "city",              label: "City",               weight: 5,  test: (b) => !!b.city },
  { key: "description",       label: "Description",        weight: 10, test: (b) => (b.description || "").length >= 100 },
  { key: "tagline",           label: "Tagline",            weight: 5,  test: (b) => !!b.tagline },
  { key: "businessModel",     label: "Business model",     weight: 5,  test: (b) => !!b.businessModel },
  { key: "employeeCount",     label: "Employee count",     weight: 5,  test: (b) => b.employeeCount != null },
  { key: "teamSize",          label: "Team size",          weight: 5,  test: (b) => Number(b.employeeCount) >= 10 },
  { key: "fundingAsk",        label: "Funding ask",        weight: 5,  test: (b) => !!b.fundingAsk },
  { key: "fundingInstrument", label: "Funding instrument", weight: 5,  test: (b) => !!b.fundingInstrument },
  { key: "useOfFunds",        label: "Use of funds",       weight: 5,  test: (b) => Array.isArray(b.useOfFunds) && b.useOfFunds.length > 0 },
  { key: "revenueRange",      label: "Revenue range",      weight: 10, test: (b) => !!b.revenueRange },
  { key: "customerCount",     label: "Customer count",     weight: 5,  test: (b) => b.customerCount != null },
  { key: "revenueTrend",      label: "Revenue trend",      weight: 5,  test: (b) => !!b.revenueTrendBracket },
  { key: "verifiedDocs",      label: "Verified documents", weight: 10, test: (b) => b.verificationTier === "verified" },
  { key: "basicDocs",         label: "Basic documents",    weight: 5,  test: (b) => b.verificationTier === "basic" },
  { key: "website",           label: "Website",            weight: 5,  test: (b) => !!b.websiteUrl },
  { key: "logo",              label: "Logo",               weight: 5,  test: (b) => !!b.logoUrl },
];

// ─── Pure computation ────────────────────────────────────────
export function computeReadiness(business = {}) {
  const breakdown = FEATURES.map((f) => {
    const passed = !!f.test(business);
    return {
      key: f.key,
      label: f.label,
      points: passed ? f.weight : 0,
      maxPoints: f.weight,
      passed,
    };
  });

  // Verification tier is exclusive: verified implies basic, so `basicDocs`
  // is not a legitimate gap when the business is already verified.
  const notApplicable = new Set();
  if (business.verificationTier === "verified") notApplicable.add("basicDocs");

  const score = breakdown.reduce((sum, b) => sum + b.points, 0);

  const missing = breakdown
    .filter((b) => !b.passed && !notApplicable.has(b.key))
    .map((b) => ({ key: b.key, label: b.label, impact: b.maxPoints }))
    .sort((a, b) => b.impact - a.impact);

  const suggestions = missing
    .slice(0, 3)
    .map((m) => `Add ${m.label.toLowerCase()} to improve your readiness score`);

  return { score, percentage: score, breakdown, missing, suggestions };
}

// ─── Persist ─────────────────────────────────────────────────
export async function recomputeReadiness(businessId, userId = null) {
  const [business] = await db
    .select()
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);

  if (!business) return null;

  if (userId !== null && business.ownerId !== userId) {
    throw ApiError.forbidden("You do not own this business");
  }

  const result = computeReadiness(business);

  const [row] = await db
    .insert(readinessScores)
    .values({
      businessId,
      score: result.score,
      modelVersion: MODEL_VERSION,
      shapBreakdown: result.breakdown,
      suggestions: result.suggestions,
      sector: business.sector || null,
      stage: null,
      computedAt: new Date(),
    })
    .returning();

  await db
    .update(businesses)
    .set({ currentReadinessScore: result.score })
    .where(eq(businesses.id, businessId));

  return row;
}

// ─── Latest or compute-on-the-fly (no ownership) ─────────────
export async function getReadiness(businessId) {
  const [business] = await db
    .select()
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);

  if (!business) throw ApiError.notFound("Business not found");

  const computed = computeReadiness(business);

  const [row] = await db
    .select()
    .from(readinessScores)
    .where(eq(readinessScores.businessId, businessId))
    .orderBy(desc(readinessScores.computedAt))
    .limit(1);

  if (row) {
    // Persisted score is authoritative; shape comes from the recompute
    return {
      ...computed,
      score: row.score,
      percentage: row.score,
      persisted: true,
      computedAt: row.computedAt,
    };
  }

  return computed;
}

// ─── Ownership-checked wrappers for routes ───────────────────
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