import { getBoss } from "../config/pgBoss.js";
import { db } from "../config/db.postgres.js";
import { profileDrafts } from "../models/postgres/index.js";
import { eq } from "drizzle-orm";
import { draftProfile } from "../services/profileDraft.service.js";

// ─── Rate limiter (per-queue) ──────────────────────────────
// Wizard: no rate limit (real users, rare).
// Batch: 14 requests per minute, matching Gemini free tier.
// Simple sliding window — same shape as the one in
// src/utils/rateLimiter.js but non-throwing (we sleep, not reject).

class SlidingWindowLimiter {
  constructor(maxPerWindow, windowMs) {
    this.max = maxPerWindow;
    this.windowMs = windowMs;
    this.timestamps = [];
  }
  async acquire() {
    while (true) {
      const now = Date.now();
      this.timestamps = this.timestamps.filter((t) => now - t < this.windowMs);
      if (this.timestamps.length < this.max) {
        this.timestamps.push(now);
        return;
      }
      const oldest = this.timestamps[0];
      const waitMs = this.windowMs - (now - oldest) + 50;
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
}

const batchLimiter = new SlidingWindowLimiter(14, 60_000);

// ─── Job processing ───────────────────────────────────────

async function processJob(job, { rateLimit }) {
  const { businessId } = job.data;
  let draftRow = null;

  try {
    // job.id is a globally unique UUID from pg-boss — no conflict possible.
    // The old onConflictDoUpdate required a unique index on job_id,
    // which the migration didn't create. Insert is now plain.
    [draftRow] = await db
      .insert(profileDrafts)
      .values({
        businessId,
        jobId: job.id,
        status: "running",
        step: "queued",
        progress: 0,
      })
      .returning();

    const onProgress = async (step, progress) => {
      await db
        .update(profileDrafts)
        .set({ step, progress, updatedAt: new Date() })
        .where(eq(profileDrafts.id, draftRow.id));
    };

    if (rateLimit) await rateLimit.acquire();
    const result = await draftProfile(businessId, {
      documentUrls: job.data.documentUrls || [],
      onProgress,
    });

    await db
      .update(profileDrafts)
      .set({
        status: "complete",
        step: "complete",
        progress: 100,
        drafts: result.drafts,
        updatedAt: new Date(),
      })
      .where(eq(profileDrafts.id, draftRow.id));

    return { draftRowId: draftRow.id, ...result };
  } catch (err) {
    console.error(`[worker] draft failed for ${businessId}:`, err.message);
    if (draftRow) {
      await db
        .update(profileDrafts)
        .set({ status: "failed", error: err.message, updatedAt: new Date() })
        .where(eq(profileDrafts.id, draftRow.id));
    }
    throw err;
  }
}

// ─── Start workers ────────────────────────────────────────

export async function startProfileDraftWorkers() {
  const boss = await getBoss();

  // Wizard: up to 5 in flight, no rate limit.
  await boss.work(
    "profile-draft-wizard",
    { batchSize: 5, pollingIntervalSeconds: 1 },
    async (jobs) => {
      const results = [];
      for (const job of jobs) {
        results.push(await processJob(job, { rateLimit: null }));
      }
      return results;
    }
  );

  // Batch: 1 in flight, rate limited to Gemini free tier.
  // concurrency 1 means batch never competes with wizard for GPU/CPU
  // during LLM calls, even if wizard queue has burst.
  await boss.work(
    "profile-draft-batch",
    { batchSize: 1, pollingIntervalSeconds: 10 },
    async (jobs) => {
      const results = [];
      for (const job of jobs) {
        results.push(await processJob(job, { rateLimit: batchLimiter }));
      }
      return results;
    }
  );

  console.log("[worker] profile-draft workers started (wizard=5, batch=1)");
}