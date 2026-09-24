import { eq, desc, sql, and } from "drizzle-orm";
import { db } from "../config/db.postgres.js";
import {
  investments,
  businesses,
  users,
  pitches,
} from "../models/postgres/index.js";
import { ApiError } from "../utils/apiError.js";

// ---------- Create (called by acceptOffer, not a route) ----------
/**
 * Called inside the acceptOffer transaction.
 * Snapshots terms from the accepted offer. Immutable once created.
 */
export const createInvestment = async (tx, { offerId, pitchId, investorId, businessId, amount, equity, valuation }) => {
  const [investment] = await tx
    .insert(investments)
    .values({
      offerId,
      pitchId,
      investorId,
      businessId,
      amount: String(amount),
      equity: String(equity),
      valuation: String(valuation),
      status: "active",
    })
    .returning();

  return investment;
};

// ---------- Read: investor portfolio ----------
export const getMyPortfolio = async (investorId, { limit = 20, offset = 0 } = {}) => {
  const rows = await db
    .select({
      investment: investments,
      business: {
        id: businesses.id,
        companyName: businesses.companyName,
        sector: businesses.sector,
        city: businesses.city,
        verificationTier: businesses.verificationTier,
      },
      pitch: {
        id: pitches.id,
        title: pitches.title,
        stage: pitches.stage,
      },
    })
    .from(investments)
    .innerJoin(businesses, eq(businesses.id, investments.businessId))
    .innerJoin(pitches, eq(pitches.id, investments.pitchId))
    .where(eq(investments.investorId, investorId))
    .orderBy(desc(investments.investedAt))
    .limit(limit)
    .offset(offset);

  const [totalRow] = await db
    .select({ count: sql`count(*)`.mapWith(Number) })
    .from(investments)
    .where(eq(investments.investorId, investorId));

  return {
    investments: rows,
    pagination: { limit, offset, total: totalRow.count },
  };
};

// ---------- Read: business funding history ----------
export const getBusinessInvestments = async (businessId, userId, { limit = 20, offset = 0 } = {}) => {
  // Ownership check — only the business owner sees who invested
  const business = await db.query.businesses.findFirst({
    where: eq(businesses.id, businessId),
    columns: { id: true, ownerId: true },
  });
  if (!business) throw ApiError.notFound("Business not found");
  if (business.ownerId !== userId) {
    throw ApiError.forbidden("You do not own this business");
  }

  const rows = await db
    .select({
      investment: investments,
      investor: {
        id: users.id,
        name: users.name,
        avatarUrl: users.avatarUrl,
      },
      pitch: {
        id: pitches.id,
        title: pitches.title,
      },
    })
    .from(investments)
    .innerJoin(users, eq(users.id, investments.investorId))
    .innerJoin(pitches, eq(pitches.id, investments.pitchId))
    .where(eq(investments.businessId, businessId))
    .orderBy(desc(investments.investedAt))
    .limit(limit)
    .offset(offset);

  const [totalRow] = await db
    .select({ count: sql`count(*)`.mapWith(Number) })
    .from(investments)
    .where(eq(investments.businessId, businessId));

  return {
    investments: rows,
    pagination: { limit, offset, total: totalRow.count },
  };
};

// ---------- Read: single investment ----------
export const getInvestment = async (investmentId, userId) => {
  const investment = await db.query.investments.findFirst({
    where: eq(investments.id, investmentId),
  });
  if (!investment) throw ApiError.notFound("Investment not found");

  // Participant check — must be the investor OR the business owner
  if (investment.investorId === userId) return investment;

  const business = await db.query.businesses.findFirst({
    where: eq(businesses.id, investment.businessId),
    columns: { ownerId: true },
  });
  if (!business || business.ownerId !== userId) {
    throw ApiError.forbidden("You are not part of this investment");
  }

  return investment;
};

// ---------- Read: portfolio summary ----------
export const getPortfolioSummary = async (investorId) => {
  const [totals] = await db
    .select({
      totalInvested: sql`COALESCE(SUM(${investments.amount}), 0)`.as("total_invested"),
      count: sql`count(*)`.mapWith(Number),
    })
    .from(investments)
    .where(eq(investments.investorId, investorId));

  const byStatus = await db
    .select({
      status: investments.status,
      count: sql`count(*)`.mapWith(Number),
    })
    .from(investments)
    .where(eq(investments.investorId, investorId))
    .groupBy(investments.status);

  const bySector = await db
    .select({
      sector: businesses.sector,
      count: sql`count(*)`.mapWith(Number),
    })
    .from(investments)
    .innerJoin(businesses, eq(businesses.id, investments.businessId))
    .where(eq(investments.investorId, investorId))
    .groupBy(businesses.sector);

  const [dateRange] = await db
    .select({
      first: sql`MIN(${investments.investedAt})`.as("first_invested"),
      last: sql`MAX(${investments.investedAt})`.as("last_invested"),
    })
    .from(investments)
    .where(eq(investments.investorId, investorId));

  return {
    totalInvested: String(totals.totalInvested),
    investmentCount: totals.count,
    byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r.count])),
    bySector: Object.fromEntries(bySector.map((r) => [r.sector || "unknown", r.count])),
    firstInvestmentAt: dateRange.first,
    lastInvestmentAt: dateRange.last,
  };
};