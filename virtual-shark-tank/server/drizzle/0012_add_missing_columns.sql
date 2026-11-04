ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "badges" jsonb DEFAULT '[]'::jsonb;
--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "curated_note" text;
--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "investor_brief" jsonb;
--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "investor_brief_generated_at" timestamptz;
--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "logo_checked_at" timestamptz;