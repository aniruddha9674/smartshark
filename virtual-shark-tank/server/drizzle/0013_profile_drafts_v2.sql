-- Queue infrastructure removed — new profile_drafts shape.
-- Drops the old shape (job_id, status, step, progress, error) and
-- creates the draft-only shape that the inline controller uses.

DROP TABLE IF EXISTS profile_drafts CASCADE;

CREATE TABLE IF NOT EXISTS profile_drafts (
  business_id uuid PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
  drafts jsonb NOT NULL,
  extraction_methods jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_text text,
  source_url varchar(500),
  fetched_at timestamp,
  generated_at timestamp NOT NULL DEFAULT NOW()
);

ALTER TABLE businesses ADD COLUMN IF NOT EXISTS draft_attempted_at timestamp;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS draft_generated_at timestamp;

CREATE INDEX IF NOT EXISTS businesses_draft_batch_idx
  ON businesses (draft_attempted_at)
  WHERE website_url IS NOT NULL AND data_source = 'mca';