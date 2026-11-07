import { eq } from "drizzle-orm";
import { db } from "../config/db.postgres.js";
import { businesses, profileDrafts } from "../models/postgres/index.js";
import { draftProfile } from "../services/profileDraft.service.js";
import { ApiError } from "../utils/apiError.js";
import { env } from "../config/env.js";

const IN_FLIGHT = new Set();
const COOLDOWN_MS = 24 * 60 * 60 * 1000;


async function assertCanDraft(businessId, userId) {
  const [business] = await db
    .select()
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);

  if (!business) throw ApiError.notFound("Business not found");

  // Unclaimed MCA business (ownerId null) → any authenticated user may draft.
  // Pre-claim path — user is evaluating before claiming.
  // Claimed business → only the owner (or admin) may draft.
  if (business.ownerId !== null && business.ownerId !== userId) {
    throw ApiError.forbidden("You do not own this business");
  }

  return business;
}

export const startDraft = async (req, res) => {
  const { id: businessId } = req.params;
  const refresh = req.query.refresh === "1";

  await assertCanDraft(businessId, req.user.id);

  // In-flight guard — double-click protection
  if (IN_FLIGHT.has(businessId)) {
    return res.status(409).json({ error: "Draft already in progress" });
  }

  // Cooldown — return existing draft if fresh
  if (!refresh) {
    const [existing] = await db
      .select()
      .from(profileDrafts)
      .where(eq(profileDrafts.businessId, businessId))
      .limit(1);

    if (existing && Date.now() - new Date(existing.generatedAt).getTime() < COOLDOWN_MS) {
      return res.json({
        drafts: existing.drafts,
        extractionMethods: existing.extractionMethods,
        cached: true,
        generatedAt: existing.generatedAt,
      });
    }
  }

      IN_FLIGHT.add(businessId);
    try {
      const result = await draftProfile(businessId);

    // Guard against overwriting a good draft with an empty one (reviewer's #3)
    if (result.fieldCount === 0) {
      const [existing] = await db
        .select()
        .from(profileDrafts)
        .where(eq(profileDrafts.businessId, businessId))
        .limit(1);

      return res.status(200).json({
        drafts: existing?.drafts ?? {},
        message: "Couldn't generate a draft right now. You can continue manually.",
        scrapeCode: result.scrapeCode,
        llmCode: result.llmCode,
      });
    }

    await db
      .insert(profileDrafts)
      .values({
        businessId,
        drafts: result.drafts,
        extractionMethods: result.extractionMethods,
        rawText: result.rawText,
        sourceUrl: result.sourceUrl,
        fetchedAt: result.sourceUrl ? new Date() : null,
        generatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: profileDrafts.businessId,
        set: {
          drafts: result.drafts,
          extractionMethods: result.extractionMethods,
          rawText: result.rawText,
          sourceUrl: result.sourceUrl,
          fetchedAt: result.sourceUrl ? new Date() : null,
          generatedAt: new Date(),
        },
      });

    // Coarse codes only — never raw error strings (information leak)
    return res.status(201).json({
      drafts: result.drafts,
      extractionMethods: result.extractionMethods,
      fieldCount: result.fieldCount,
      scrapeCode: result.scrapeCode,
      llmCode: result.llmCode,
    });
    } catch (err) {
    console.error(`[profileDraft] fatal for ${businessId}:`, err.message);
    return res.status(500).json({
      error: "Draft failed",
      message: env.nodeEnv === "production"
        ? "You can continue filling the profile manually."
        : err.message,          // ← dev only: see the real cause in curl
      stack: env.nodeEnv === "production" ? undefined : err.stack,
    });
  } finally {
    IN_FLIGHT.delete(businessId);
  }
};

export const getDraft = async (req, res) => {
  const [row] = await db
    .select()
    .from(profileDrafts)
    .where(eq(profileDrafts.businessId, req.params.id))
    .limit(1);

  if (!row) throw ApiError.notFound("No draft exists for this business");

  res.json({
    drafts: row.drafts,
    extractionMethods: row.extractionMethods,
    sourceUrl: row.sourceUrl,
    generatedAt: row.generatedAt,
  });
};