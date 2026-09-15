CREATE TYPE "public"."pitch_revenue_range" AS ENUM('pre_revenue', 'under_10L', '10L_1Cr', '1Cr_10Cr', '10Cr_plus');--> statement-breakpoint
CREATE TYPE "public"."pitch_stage" AS ENUM('idea', 'mvp', 'early_revenue', 'growth', 'scale');--> statement-breakpoint
CREATE TYPE "public"."pitch_status" AS ENUM('draft', 'live', 'closed', 'funded', 'withdrawn');--> statement-breakpoint
CREATE TABLE "pitches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"title" varchar(255) NOT NULL,
	"tagline" varchar(300),
	"short_pitch" varchar(500),
	"long_summary" text,
	"ask_amount" numeric NOT NULL,
	"equity_offered" numeric NOT NULL,
	"valuation" numeric NOT NULL,
	"stage" "pitch_stage",
	"revenue_range" "pitch_revenue_range",
	"monthly_growth_pct" numeric,
	"team_size" integer,
	"founded_year" integer,
	"content" jsonb,
	"video_url" varchar(500),
	"pitch_deck_url" varchar(500),
	"cover_image_url" varchar(500),
	"sector_specific_fields" jsonb,
	"status" "pitch_status" DEFAULT 'draft' NOT NULL,
	"published_at" timestamp,
	"closed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "pitch_equity_range" CHECK ("pitches"."equity_offered" > 0 AND "pitches"."equity_offered" <= 100),
	CONSTRAINT "pitch_ask_positive" CHECK ("pitches"."ask_amount" > 0),
	CONSTRAINT "pitch_team_size_positive" CHECK ("pitches"."team_size" IS NULL OR "pitches"."team_size" > 0),
	CONSTRAINT "pitch_founded_year_range" CHECK ("pitches"."founded_year" IS NULL OR ("pitches"."founded_year" >= 1900 AND "pitches"."founded_year" <= 2100))
);
--> statement-breakpoint
ALTER TABLE "pitches" ADD CONSTRAINT "pitches_business_id_users_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pitch_business_idx" ON "pitches" USING btree ("business_id","status");--> statement-breakpoint
CREATE INDEX "pitch_live_feed_idx" ON "pitches" USING btree ("status","published_at");--> statement-breakpoint
CREATE INDEX "pitch_stage_revenue_idx" ON "pitches" USING btree ("status","stage","revenue_range");--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversation_ordered_pair" CHECK ("conversations"."participant_a_id" < "conversations"."participant_b_id");--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "no_self_follow" CHECK ("follows"."follower_id" <> "follows"."following_id");--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "no_self_match" CHECK ("matches"."business_id" <> "matches"."investor_id");--> statement-breakpoint
ALTER TABLE "profile_views" ADD CONSTRAINT "no_self_view" CHECK ("profile_views"."viewer_id" <> "profile_views"."viewed_id");