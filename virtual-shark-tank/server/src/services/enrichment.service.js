import { eq, and,sql } from "drizzle-orm";
import { db } from "../config/db.postgres.js";
import { businesses } from "../models/postgres/index.js";
import { env } from "../config/env.js";
import { withRetry, isTransientError } from "../utils/retry.js";
import { ApiError } from "../utils/apiError.js";

const BRANDFETCH_CLIENT_ID = env.brandfetchClientId;

const SECTOR_KEYWORDS = {
  foodtech: "food",
  agritech: "agriculture",
  fintech: "finance",
  saas: "technology",
  technology: "technology",
  healthcare: "medical",
  medical: "medical",
  beauty: "beauty",
  fashion: "fashion",
  lifestyle: "lifestyle",
  education: "education",
  children: "children",
  fitness: "fitness",
  manufacturing: "factory",
  logistics: "logistics",
  ecommerce: "ecommerce",
  entertainment: "entertainment",
  vehicles: "automotive",
  green: "sustainability",
  cleantech: "sustainability",
  animal: "pets",
  "business services": "business",
};

const extractDomain = (url) => {
  if (!url) return null;
  try {
    const normalized = url.startsWith("http") ? url : `https://${url}`;
    const { hostname } = new URL(normalized);
    return hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
};

const buildLogoUrl = (domain) => {
  if (!domain) return null;
  return `https://cdn.brandfetch.io/${domain}/w/128/h/128/theme/light/fallback/lettermark/icon?c=${BRANDFETCH_CLIENT_ID}`;
};
const fetchCoverImage = async (sector) => {
  const keyword = SECTOR_KEYWORDS[sector] || "business";
  const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(keyword)}&per_page=1&orientation=landscape`;

  const data = await withRetry(
    async () => {
      const response = await fetch(url, {
        headers: { Authorization: `Client-ID ${env.unsplashAccessKey}` },
      });
      if (!response.ok) {
        throw new Error(`Unsplash returned ${response.status}`);
      }
      return response.json();
    },
    { attempts: 3, shouldRetry: isTransientError }
  );

  if (!data.results || data.results.length === 0) return null;
  return data.results[0].urls?.regular || null;
};

// ═══════════════════════════════════════════════════════════════
// Enrich one business
// ═══════════════════════════════════════════════════════════════
export const enrichBusiness = async (businessId, { skipCover = false } = {}) => {
  const [business] = await db
    .select()
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);

  if (!business) throw ApiError.notFound("Business not found");

  const domain = extractDomain(business.websiteUrl);
  const logoUrl = buildLogoUrl(domain);

  let coverImageUrl = null;
  let status = logoUrl ? "partial" : "skipped";

  // Only fetch cover when the caller asked for it.
  if (!skipCover) {
    try {
      coverImageUrl = await fetchCoverImage(business.sector);
      if (logoUrl && coverImageUrl) status = "enriched";
      else if (!logoUrl && coverImageUrl) status = "partial";
    } catch (err) {
      console.error(`[enrich] cover failed for ${business.id}:`, err.message);
      // keep the status from the logo check
    }
  }

  const [updated] = await db
    .update(businesses)
    .set({
      logoUrl,
      coverImageUrl,
      enrichmentStatus: status,
      enrichedAt: new Date(),
    })
    .where(eq(businesses.id, businessId))
    .returning();

  return updated;
};

// ═══════════════════════════════════════════════════════════════
// Batch enrichment
// ═══════════════════════════════════════════════════════════════
export const enrichPending = async ({
  limit = 50,
  offset = 0,
  skipCover = true,
  batchSize = 200,
} = {}) => {
  const totals = { processed: 0, enriched: 0, partial: 0, failed: 0, skipped: 0 };

  while (totals.processed < limit) {
    const take = Math.min(batchSize, limit - totals.processed);

    const pending = await db
      .select()
      .from(businesses)
      .where(
        and(
          eq(businesses.isExternal, true),
          eq(businesses.enrichmentStatus, "pending")
        )
      )
      .orderBy(businesses.createdAt)
      .limit(take)
      .offset(offset);

    if (pending.length === 0) break;

    const updates = [];

    for (const business of pending) {
      try {
        const domain = extractDomain(business.websiteUrl);
        const logoUrl = buildLogoUrl(domain);
        let coverImageUrl = null;
        let status = logoUrl ? "partial" : "skipped";

        if (!skipCover) {
          try {
            coverImageUrl = await fetchCoverImage(business.sector);
            if (logoUrl && coverImageUrl) status = "enriched";
          } catch (err) {
            console.error(`[enrich] cover failed for ${business.id}:`, err.message);
          }
        }

        updates.push({ id: business.id, logoUrl, coverImageUrl, status });
        totals[status] = (totals[status] || 0) + 1;
      } catch (err) {
        console.error(`[enrich] failed for ${business.id}:`, err.message);
        totals.failed++;
      }
    }

    if (updates.length > 0) {
      const values = updates.map(
        (u) =>
          sql`(${u.id}::uuid, ${u.logoUrl}::varchar, ${u.coverImageUrl}::varchar, ${u.status}::varchar)`
      );

      await db.execute(sql`
        UPDATE businesses AS b
        SET logo_url = v.logo_url,
            cover_image_url = v.cover_image_url,
            enrichment_status = v.status,
            enriched_at = NOW()
        FROM (VALUES ${sql.join(values, sql`, `)})
          AS v(id, logo_url, cover_image_url, status)
        WHERE b.id = v.id
      `);
    }

    totals.processed += pending.length;

    if (pending.length < take) break;
  }

  return totals;
};