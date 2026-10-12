import { sql } from "drizzle-orm";
import { db } from "../config/db.postgres.js";

/**
 * Search businesses with fuzzy matching + relevance ranking.
 * Also returns the current investor's match_id for each business (if it exists).
 */
export const searchBusinesses = async (
  query,
  userId,
  { limit = 20, offset = 0 } = {}
) => {
  if (!query || query.trim().length < 2) {
    return { results: [], total: 0 };
  }

  const q = query.trim();

  const rows = await db.execute(sql`
    SELECT
      b.id,
      b.company_name,
      b.sector,
      b.city,
      b.description,
      b.funding_ask,
      b.verification_tier,
      b.logo_url,
      b.is_external,
      m.id AS match_id,
      m.match_score,
      GREATEST(
        similarity(b.company_name, ${q}),
        word_similarity(${q}, b.company_name) * 0.9,
        similarity(b.sector, ${q}) * 0.5,
        similarity(b.city, ${q}) * 0.5,
        similarity(COALESCE(b.description, ''), ${q}) * 0.3
      ) AS rank
    FROM businesses b
    LEFT JOIN matches m
      ON m.business_id = b.id
      AND m.investor_id = ${userId}
    WHERE
      b.company_name % ${q}
      OR b.sector % ${q}
      OR b.city % ${q}
      OR b.company_name ILIKE ${"%" + q + "%"}
      OR b.sector ILIKE ${"%" + q + "%"}
      OR b.city ILIKE ${"%" + q + "%"}
    ORDER BY rank DESC, b.company_name ASC
    LIMIT ${limit}
    OFFSET ${offset}
  `);

  return {
    results: rows.rows,
    total: rows.rows.length,
  };
};