ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "badges" jsonb DEFAULT '[]'::jsonb;
--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "curated_note" text;
--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "investor_brief" jsonb;
--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "investor_brief_generated_at" timestamptz;
--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "logo_checked_at" timestamptz;

CREATE TABLE IF NOT EXISTS profile_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  job_id varchar(100) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'queued',
  step varchar(30) NOT NULL DEFAULT 'queued',
  progress integer NOT NULL DEFAULT 0,
  drafts jsonb,
  error text,
  created_at timestamp NOT NULL DEFAULT NOW(),
  updated_at timestamp NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS profile_drafts_business_idx ON profile_drafts (business_id);
CREATE INDEX IF NOT EXISTS profile_drafts_job_idx ON profile_drafts (job_id);