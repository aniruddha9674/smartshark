CREATE TABLE "profile_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"job_id" varchar(100) NOT NULL,
	"status" varchar(20) DEFAULT 'queued' NOT NULL,
	"step" varchar(30) DEFAULT 'queued' NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"drafts" jsonb,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "badges" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "curated_note" text;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "logo_checked_at" timestamp;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "investor_brief" jsonb;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "investor_brief_generated_at" timestamp;--> statement-breakpoint
ALTER TABLE "profile_drafts" ADD CONSTRAINT "profile_drafts_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "profile_drafts_business_idx" ON "profile_drafts" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "profile_drafts_job_idx" ON "profile_drafts" USING btree ("job_id");