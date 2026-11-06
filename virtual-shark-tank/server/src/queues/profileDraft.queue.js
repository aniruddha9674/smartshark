import { getBoss } from "../config/pgBoss.js";

const QUEUE_WIZARD = "profile-draft-wizard";
const QUEUE_BATCH = "profile-draft-batch";

// Enqueue a draft job. Returns the pg-boss job ID.
// Source determines which queue is used:
//   "wizard" → fast pickup, no rate limit (a real user is waiting)
//   "batch"  → rate-limited to Gemini free tier (14/min), runs overnight
export async function enqueueDraft(businessId, { source = "wizard", documentUrls = [] } = {}) {
  const boss = await getBoss();
  const queue = source === "batch" ? QUEUE_BATCH : QUEUE_WIZARD;

  const jobId = await boss.send(
    queue,
    { businessId, source, documentUrls },
    {
      // Retry twice on failure, exponential backoff starting at 1 min.
      // LLM 503s are transient — a 3rd attempt 5 min later often succeeds.
      retryLimit: 2,
      retryDelay: 60,
      retryBackoff: true,
      // Expire after 1 hour — a draft older than that is stale.
      expireInSeconds: 3600,
    }
  );

  return jobId;
}

// Read job status for the wizard polling endpoint.
// Returns enough to render Step 3: { status, step, progress, drafts, error }.
export async function getJobStatus(jobId) {
  const boss = await getBoss();
  const job = await boss.getJobById(jobId);
  if (!job) return null;

  // pg-boss states: created, retry, active, completed, cancelled, failed
  const statusMap = {
    created: "queued",
    retry: "queued",
    active: "running",
    completed: "complete",
    failed: "failed",
    cancelled: "failed",
  };

  return {
    jobId,
    status: statusMap[job.state] || job.state,
    output: job.output || null,
    error: job.state === "failed" ? job.output?.message || "Draft failed" : null,
  };
}