import { enqueueDraft, getJobStatus } from "../queues/profileDraft.queue.js";
import { db } from "../config/db.postgres.js";
import { profileDrafts } from "../models/postgres/index.js";
import { eq, and } from "drizzle-orm";
import { ApiError } from "../utils/apiError.js";

export const startDraft = async (req, res) => {
  const businessId = req.params.id;
  const jobId = await enqueueDraft(businessId, { source: "wizard" });
  res.status(202).json({ jobId, estimatedSeconds: 10 });
};

export const getDraftStatus = async (req, res) => {
  const { id: businessId, jobId } = req.params;

  const [row] = await db
    .select()
    .from(profileDrafts)
    .where(
      and(
        eq(profileDrafts.jobId, jobId),
        eq(profileDrafts.businessId, businessId)
      )
    )
    .limit(1);

  if (!row) throw ApiError.notFound("Draft job not found");

  res.json({
    jobId: row.jobId,
    status: row.status,
    step: row.step,
    progress: row.progress,
    drafts: row.status === "complete" ? row.drafts : null,
    error: row.error,
  });
};