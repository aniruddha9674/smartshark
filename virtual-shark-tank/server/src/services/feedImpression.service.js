import { eq, and, desc, sql, gte } from "drizzle-orm";
import { db } from "../config/db.postgres.js";
import { feedImpressions } from "../models/postgres/index.js";

// ============================================================
// LOG — batch insert, one call per feed load
// ============================================================

/**
 * Log a batch of impressions for a feed load.
 * Called once per feed request, not once per pitch.
 *
 * Fire-and-forget: never blocks the response.
 *
 * @param {object[]} impressions - [{ userId, pitchId, surface, position, score, modelVersion }]
 */
export const logBatch = async (impressions) => {
  if (!impressions.length) return;

  try {
    const now = new Date();
    const rows = impressions.map((i) => ({
      userId: i.userId,
      pitchId: i.pitchId,
      surface: i.surface,
      position: i.position,
      score: i.score != null ? String(i.score) : null,
      modelVersion: i.modelVersion,
      createdAt: now,
    }));

    await db.insert(feedImpressions).values(rows);
  } catch (err) {
    console.error("[feedImpression.logBatch] Failed:", err.message);
  }
};

// ============================================================
// READ
// ============================================================

/**
 * Who saw this pitch recently?
 */
export const listForPitch = async (
  pitchId,
  { since, limit = 100, offset = 0 } = {}
) => {
  const conditions = [eq(feedImpressions.pitchId, pitchId)];
  if (since) conditions.push(gte(feedImpressions.createdAt, since));

  const rows = await db
    .select()
    .from(feedImpressions)
    .where(and(...conditions))
    .orderBy(desc(feedImpressions.createdAt))
    .limit(limit)
    .offset(offset);

  return { impressions: rows };
};

/**
 * What did this user see recently?
 * Useful for debugging "why didn't X show up?"
 */
export const listForUser = async (
  userId,
  { since, limit = 100, offset = 0 } = {}
) => {
  const conditions = [eq(feedImpressions.userId, userId)];
  if (since) conditions.push(gte(feedImpressions.createdAt, since));

  const rows = await db
    .select()
    .from(feedImpressions)
    .where(and(...conditions))
    .orderBy(desc(feedImpressions.createdAt))
    .limit(limit)
    .offset(offset);

  return { impressions: rows };
};

/**
 * Total impression count for a pitch — lightweight analytics.
 */
export const countForPitch = async (pitchId, since) => {
  const conditions = [eq(feedImpressions.pitchId, pitchId)];
  if (since) conditions.push(gte(feedImpressions.createdAt, since));

  const [row] = await db
    .select({ count: sql`count(*)`.mapWith(Number) })
    .from(feedImpressions)
    .where(and(...conditions));

  return row.count;
};