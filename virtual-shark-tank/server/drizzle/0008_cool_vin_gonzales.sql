DO $$ BEGIN
 CREATE TYPE "public"."match_status" AS ENUM('pending', 'viewed', 'shortlisted', 'passed', 'connected');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"investor_id" uuid NOT NULL,
	"match_score" integer NOT NULL,
	"match_reasons" jsonb NOT NULL,
	"model_version" varchar(50) DEFAULT 'rules-v1' NOT NULL,
	"status" "match_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "matches" ADD CONSTRAINT "matches_business_id_users_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "matches" ADD CONSTRAINT "matches_investor_id_users_id_fk" FOREIGN KEY ("investor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "unique_match_pair_idx" ON "matches" USING btree ("business_id","investor_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "match_investor_score_idx" ON "matches" USING btree ("investor_id","match_score");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "match_business_score_idx" ON "matches" USING btree ("business_id","match_score");