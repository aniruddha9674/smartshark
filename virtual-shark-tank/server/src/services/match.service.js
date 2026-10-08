import { eq, and, ne, gte, desc, inArray } from "drizzle-orm";
import { db } from "../config/db.postgres.js";
import {
  businesses,
  investorProfiles,
  matches,
  readinessScores,
} from "../models/postgres/index.js";
import { ApiError } from "../utils/apiError.js";

const MODEL_VERSION = "rules-v1";

// ─── Helpers ───────────────────────────────────────────────────
const parseList = (str) => {
  if (!str) return [];
  return String(str)
    .toLowerCase()
    .split(/[,/]/)
    .map((s) => s.trim())
    .filter(Boolean);
};

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

// ─── Individual factor scorers ─────────────────────────────────
const scoreSector = (investor, business) => {
  const focus = parseList(investor.investmentFocus);
  const sector = (business.sector || "").toLowerCase().trim();

  if (focus.length === 0) {
    return { score: 15, matched: false, detail: "investor has no sector preference (neutral)" };
  }
  if (!sector) {
    return { score: 0, matched: false, detail: "business has no sector set" };
  }
  if (focus.includes(sector)) {
    return { score: 30, matched: true, detail: `${business.sector} in investor focus` };
  }
  if (focus.some((f) => sector.includes(f) || f.includes(sector))) {
    return { score: 20, matched: true, detail: `partial sector match: ${business.sector}` };
  }
  return { score: 0, matched: false, detail: `${business.sector} not in investor focus` };
};

const scoreTicketSize = (investor, business) => {
  const ask = business.fundingAsk != null ? Number(business.fundingAsk) : null;
  const min = investor.minTicketSize != null ? Number(investor.minTicketSize) : null;
  const max = investor.maxTicketSize != null ? Number(investor.maxTicketSize) : null;

  if (ask === null) {
    return { score: 0, matched: false, detail: "business has no funding ask" };
  }
  if (min === null && max === null) {
    return { score: 12, matched: false, detail: "investor has no ticket range (neutral)" };
  }
  const lo = min ?? 0;
  const hi = max ?? Number.MAX_SAFE_INTEGER;
  if (ask >= lo && ask <= hi) {
    return { score: 25, matched: true, detail: `ask ${ask} in range [${lo}, ${hi}]` };
  }
  const range = hi - lo;
  const tolerance = range > 0 ? range * 0.2 : lo * 0.2;
  if (ask >= lo - tolerance && ask <= hi + tolerance) {
    return { score: 15, matched: false, detail: `ask ${ask} near range [${lo}, ${hi}]` };
  }
  return { score: 0, matched: false, detail: `ask ${ask} outside range [${lo}, ${hi}]` };
};

const scoreGeography = (investor, business) => {
  const geo = parseList(investor.preferredGeography);
  const city = (business.city || "").toLowerCase().trim();

  if (geo.length === 0 || geo.includes("any")) {
    return { score: 15, matched: false, detail: "investor open to any geography (neutral)" };
  }
  if (!city) {
    return { score: 0, matched: false, detail: "business has no city set" };
  }
  if (geo.includes(city)) {
    return { score: 20, matched: true, detail: `${business.city} in preferred geography` };
  }
  return { score: 0, matched: false, detail: `${business.city} not in preferred geography` };
};

const scoreVerification = (business) => {
  const tier = business.verificationTier || "unverified";
  const points = { unverified: 0, basic: 8, verified: 15 };
  const score = points[tier] ?? 0;
  return {
    score,
    matched: tier === "verified",
    detail: `verification tier: ${tier}`,
  };
};

const scoreReadiness = (readinessScore) => {
  if (readinessScore === null || readinessScore === undefined) {
    return { score: 0, matched: false, detail: "no readiness score yet" };
  }
  const score = Math.round((readinessScore / 100) * 10);
  return { score, matched: score >= 5, detail: `readiness ${readinessScore}/100` };
};

// ─── Combined score ────────────────────────────────────────────
const computeScore = (investor, business, readinessScore) => {
  const factors = [
    { factor: "sector", weight: 30, ...scoreSector(investor, business) },
    { factor: "ticketSize", weight: 25, ...scoreTicketSize(investor, business) },
    { factor: "geography", weight: 20, ...scoreGeography(investor, business) },
    { factor: "verification", weight: 15, ...scoreVerification(business) },
    { factor: "readiness", weight: 10, ...scoreReadiness(readinessScore) },
  ];
  const total = factors.reduce((s, f) => s + f.score, 0);
  return { score: total, reasons: factors };
};

// ─── Batch readiness lookup ────────────────────────────────────
const getLatestReadinessBatch = async (businessIds) => {
  if (businessIds.length === 0) return new Map();
  const rows = await db
    .select({
      businessId: readinessScores.businessId,
      score: readinessScores.score,
      computedAt: readinessScores.computedAt,
    })
    .from(readinessScores)
    .where(inArray(readinessScores.businessId, businessIds))
    .orderBy(desc(readinessScores.computedAt));

  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.businessId)) map.set(r.businessId, r.score);
  }
  return map;
};

// ─── Upsert ────────────────────────────────────────────────────
const upsertMatch = async (businessId, investorId, score, reasons) => {
  await db
    .insert(matches)
    .values({
      businessId,
      investorId,
      matchScore: score,
      matchReasons: reasons,
      modelVersion: MODEL_VERSION,
    })
    .onConflictDoUpdate({
      target: [matches.businessId, matches.investorId],
      set: {
        matchScore: score,
        matchReasons: reasons,
        modelVersion: MODEL_VERSION,
        updatedAt: new Date(),
      },
    });
};

// ─── Recompute for a business ──────────────────────────────────
export const recomputeForBusiness = async (businessId, userId) => {
  const business = await assertBusinessOwnership(businessId, userId);

  const investors = await db.select().from(investorProfiles);

  const activeInvestors = investors.filter(
    (i) =>
      i.investmentFocus ||
      i.preferredGeography ||
      i.minTicketSize != null ||
      i.maxTicketSize != null
  );

  const readinessMap = await getLatestReadinessBatch([businessId]);
  const readinessScore = readinessMap.get(businessId) ?? null;

  for (const investor of activeInvestors) {
    const { score, reasons } = computeScore(investor, business, readinessScore);
    await upsertMatch(businessId, investor.userId, score, reasons);
  }

  return {
    businessId,
    matchedAgainst: activeInvestors.length,
    readinessScore,
  };
};

// ─── Recompute for an investor ─────────────────────────────────
export const recomputeForInvestor = async (userId) => {
  const [investor] = await db
    .select()
    .from(investorProfiles)
    .where(eq(investorProfiles.userId, userId))
    .limit(1);

  if (!investor) throw ApiError.notFound("Investor profile not found");

  const bizList = await db
    .select()
    .from(businesses)
    .where(eq(businesses.isProfileComplete, true));

  const businessIds = bizList.map((b) => b.id);
  const readinessMap = await getLatestReadinessBatch(businessIds);

  for (const business of bizList) {
    const readinessScore = readinessMap.get(business.id) ?? null;
    const { score, reasons } = computeScore(investor, business, readinessScore);
    await upsertMatch(business.id, userId, score, reasons);
  }

  return {
    investorId: userId,
    matchedAgainst: bizList.length,
  };
};

// ─── Feed queries ──────────────────────────────────────────────
export const getInvestorFeed = async (userId, { minScore = 0, limit = 20, offset = 0 } = {}) => {
  const rows = await db
    .select({
      match: matches,
      business: businesses,
    })
    .from(matches)
    .innerJoin(businesses, eq(businesses.id, matches.businessId))
    .where(
      and(
        eq(matches.investorId, userId),
        ne(matches.status, "passed"),
        gte(matches.matchScore, minScore)
      )
    )
    .orderBy(desc(matches.matchScore))
    .limit(limit)
    .offset(offset);

  const readinessMap = await getLatestReadinessBatch(
    rows.map((r) => r.match.businessId)
  );

  return rows.map((r) => ({
    ...r.match,
    business: r.business,
    readinessScore: readinessMap.get(r.match.businessId) ?? null,
  }));
};

export const getBusinessFeed = async (businessId, userId, { minScore = 0, limit = 20, offset = 0 } = {}) => {
  await assertBusinessOwnership(businessId, userId);

  const rows = await db
    .select({
      match: matches,
      investor: investorProfiles,
    })
    .from(matches)
    .innerJoin(investorProfiles, eq(investorProfiles.userId, matches.investorId))
    .where(
      and(
        eq(matches.businessId, businessId),
        ne(matches.status, "passed"),
        gte(matches.matchScore, minScore)
      )
    )
    .orderBy(desc(matches.matchScore))
    .limit(limit)
    .offset(offset);

  return rows.map((r) => ({
    ...r.match,
    investor: r.investor,
  }));
};

// ─── Single match + ownership ──────────────────────────────────
const getMatchForUser = async (matchId, userId) => {
  const [m] = await db
    .select()
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1);

  if (!m) throw ApiError.notFound("Match not found");

  if (m.investorId === userId) return m;

  const [biz] = await db
    .select()
    .from(businesses)
    .where(eq(businesses.id, m.businessId))
    .limit(1);

  if (biz?.ownerId === userId) return m;

  throw ApiError.forbidden("Not your match");
};

export const getMatch = async (matchId, userId) => {
  return getMatchForUser(matchId, userId);
};

// ─── Actions ───────────────────────────────────────────────────
export const shortlistMatch = async (matchId, userId) => {
  await getMatchForUser(matchId, userId);
  const [updated] = await db
    .update(matches)
    .set({ status: "shortlisted", updatedAt: new Date() })
    .where(eq(matches.id, matchId))
    .returning();
  return updated;
};

export const passMatch = async (matchId, userId) => {
  await getMatchForUser(matchId, userId);
  const [updated] = await db
    .update(matches)
    .set({ status: "passed", updatedAt: new Date() })
    .where(eq(matches.id, matchId))
    .returning();
  return updated;
};