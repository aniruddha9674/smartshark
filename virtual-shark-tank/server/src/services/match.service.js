import { eq, and, ne, gte, desc, inArray, sql, or } from "drizzle-orm";
import { db } from "../config/db.postgres.js";
import {
  businesses,
  investorProfiles,
  matches,
  readinessScores,
} from "../models/postgres/index.js";
import { ApiError } from "../utils/apiError.js";
import { cacheGet, cacheSet, cacheDel } from "../config/redis.js";

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

  if (activeInvestors.length === 0) {
    return { businessId, matchedAgainst: 0 };
  }

  const readinessMap = await getLatestReadinessBatch([businessId]);
  const readinessScore = readinessMap.get(businessId) ?? null;

  const rows = activeInvestors.map((investor) => {
    const { score, reasons } = computeScore(investor, business, readinessScore);
    return {
      businessId,
      investorId: investor.userId,
      matchScore: score,
      matchReasons: reasons,
      modelVersion: MODEL_VERSION,
    };
  });

  const BATCH_SIZE = 500;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    await db
      .insert(matches)
      .values(chunk)
      .onConflictDoUpdate({
        target: [matches.businessId, matches.investorId],
        set: {
          matchScore: sql`excluded.match_score`,
          matchReasons: sql`excluded.match_reasons`,
          modelVersion: sql`excluded.model_version`,
          updatedAt: new Date(),
        },
      });
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

  // Raw SQL — `badges` and `curated_note` aren't in the Drizzle model.
  const result = await db.execute(sql`
    SELECT *
    FROM businesses
    WHERE is_profile_complete = true
       OR (
         data_source = 'mca'
         AND company_status = 'Active'
         AND (
           badges @> '["well_known"]'::jsonb
           OR listing_status = 'Listed'
           OR authorized_capital >= 10000000
         )
       )
  `);

  const bizList = result.rows;

  if (bizList.length === 0) {
    return { investorId: userId, matchedAgainst: 0 };
  }

  const businessIds = bizList.map((b) => b.id);
  const readinessMap = await getLatestReadinessBatch(businessIds);

  const rows = bizList.map((business) => {
    // Convert snake_case raw row → camelCase for computeScore
    const normalized = {
      ...business,
      fundingAsk: business.funding_ask,
      verificationTier: business.verification_tier,
      companyName: business.company_name,
      sector: business.sector,
      city: business.city,
    };
    const readinessScore = readinessMap.get(business.id) ?? null;
    const { score, reasons } = computeScore(investor, normalized, readinessScore);
    return {
      businessId: business.id,
      investorId: userId,
      matchScore: score,
      matchReasons: reasons,
      modelVersion: MODEL_VERSION,
    };
  });

  const BATCH_SIZE = 500;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    await db
      .insert(matches)
      .values(chunk)
      .onConflictDoUpdate({
        target: [matches.businessId, matches.investorId],
        set: {
          matchScore: sql`excluded.match_score`,
          matchReasons: sql`excluded.match_reasons`,
          modelVersion: sql`excluded.model_version`,
          updatedAt: new Date(),
        },
      });
  }

  return {
    investorId: userId,
    matchedAgainst: bizList.length,
  };
};

// ─── Feed queries ──────────────────────────────────────────────
export const getInvestorFeed = async (
  userId,
  { minScore = 0, limit = 20, offset = 0 } = {}
) => {
  const cacheKey = `feed:v2:${userId}:${minScore}:${limit}:${offset}`;

  const cached = await cacheGet(cacheKey);
  if (cached) return cached;

  // Raw SQL — bypasses the Drizzle model for `badges`/`curated_note`.
  const result = await db.execute(sql`
    SELECT
      m.id AS m_id,
      m.business_id, m.investor_id, m.match_score, m.match_reasons,
      m.model_version, m.status, m.created_at AS m_created_at,
      b.id AS b_id, b.company_name, b.sector, b.city, b.description,
      b.funding_ask, b.years_operating, b.verification_tier,
      b.logo_url, b.cover_image_url, b.is_external, b.website_url,
      b.badges, b.listing_status, b.authorized_capital,
      b.company_status, b.profile_completeness_pct, b.curated_note,
      (
        CASE
          WHEN b.badges @> '["well_known"]'::jsonb THEN 100000
          WHEN b.listing_status = 'Listed' THEN 50000
          WHEN b.authorized_capital >= 100000000000 THEN 10000
          WHEN b.authorized_capital >= 1000000000 THEN 5000
          WHEN b.authorized_capital >= 100000000 THEN 2000
          ELSE 0
        END
        + COALESCE(m.match_score, 0) * 10
        + COALESCE(b.profile_completeness_pct, 0) * 5
      ) AS feed_rank
    FROM matches m
    JOIN businesses b ON b.id = m.business_id
    WHERE m.investor_id = ${userId}
      AND m.status != 'passed'
      AND m.match_score >= ${minScore}
    ORDER BY feed_rank DESC, m.match_score DESC
    LIMIT ${limit}
    OFFSET ${offset}
  `);

  const readinessMap = await getLatestReadinessBatch(
    result.rows.map((r) => r.business_id)
  );

  const feed = result.rows.map((r) => ({
    id: r.m_id,
    businessId: r.business_id,
    investorId: r.investor_id,
    matchScore: r.match_score,
    matchReasons: r.match_reasons,
    modelVersion: r.model_version,
    status: r.status,
    createdAt: r.m_created_at,
    business: {
      id: r.b_id,
      companyName: r.company_name,
      sector: r.sector,
      city: r.city,
      description: r.description,
      fundingAsk: r.funding_ask,
      yearsOperating: r.years_operating,
      verificationTier: r.verification_tier,
      logoUrl: r.logo_url,
      coverImageUrl: r.cover_image_url,
      isExternal: r.is_external,
      websiteUrl: r.website_url,
      badges: r.badges,
      listingStatus: r.listing_status,
      authorizedCapital: r.authorized_capital,
      companyStatus: r.company_status,
      profileCompletenessPct: r.profile_completeness_pct,
      curatedNote: r.curated_note,
    },
    readinessScore: readinessMap.get(r.business_id) ?? null,
  }));

  await cacheSet(cacheKey, feed, 300);

  return feed;
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
  const m = await getMatchForUser(matchId, userId);

  const [business] = await db
    .select({
      id: businesses.id,
      companyName: businesses.companyName,
      sector: businesses.sector,
      city: businesses.city,
      description: businesses.description,
      fundingAsk: businesses.fundingAsk,
      yearsOperating: businesses.yearsOperating,
      verificationTier: businesses.verificationTier,
      logoUrl: businesses.logoUrl,
      coverImageUrl: businesses.coverImageUrl,
      isExternal: businesses.isExternal,
      websiteUrl: businesses.websiteUrl,
    })
    .from(businesses)
    .where(eq(businesses.id, m.businessId))
    .limit(1);

  const readinessMap = await getLatestReadinessBatch([m.businessId]);

  return {
    ...m,
    business,
    readinessScore: readinessMap.get(m.businessId) ?? null,
  };
};

// ─── Actions ───────────────────────────────────────────────────
export const shortlistMatch = async (matchId, userId) => {
  await getMatchForUser(matchId, userId);

  const [updated] = await db
    .update(matches)
    .set({ status: "shortlisted", updatedAt: new Date() })
    .where(eq(matches.id, matchId))
    .returning();

  await cacheDel(`feed:v2:${userId}:*`);

  return updated;
};

export const passMatch = async (matchId, userId) => {
  await getMatchForUser(matchId, userId);

  const [updated] = await db
    .update(matches)
    .set({ status: "passed", updatedAt: new Date() })
    .where(eq(matches.id, matchId))
    .returning();

  await cacheDel(`feed:${userId}:*`);

  return updated;
};