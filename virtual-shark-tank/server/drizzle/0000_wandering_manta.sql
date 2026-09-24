CREATE TYPE "public"."verification_tier" AS ENUM('unverified', 'basic', 'verified');--> statement-breakpoint
CREATE TYPE "public"."follow_target_type" AS ENUM('business', 'investor');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('new_match', 'new_message', 'follow', 'profile_update', 'score_change', 'verification_update', 'saved_business_activity', 'system');--> statement-breakpoint
CREATE TYPE "public"."match_status" AS ENUM('pending', 'viewed', 'shortlisted', 'passed', 'connected');--> statement-breakpoint
CREATE TYPE "public"."pitch_revenue_range" AS ENUM('pre_revenue', 'under_10L', '10L_1Cr', '1Cr_10Cr', '10Cr_plus');--> statement-breakpoint
CREATE TYPE "public"."pitch_stage" AS ENUM('idea', 'mvp', 'early_revenue', 'growth', 'scale');--> statement-breakpoint
CREATE TYPE "public"."pitch_status" AS ENUM('draft', 'live', 'closed', 'funded', 'withdrawn');--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"is_admin" boolean DEFAULT false NOT NULL,
	"is_verified" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"avatar_url" varchar(500),
	"language" varchar(10) DEFAULT 'en' NOT NULL,
	"theme" varchar(10) DEFAULT 'system' NOT NULL,
	"notify_new_match" boolean DEFAULT true NOT NULL,
	"notify_new_message" boolean DEFAULT true NOT NULL,
	"notify_follow" boolean DEFAULT true NOT NULL,
	"notify_profile_update" boolean DEFAULT true NOT NULL,
	"notify_score_change" boolean DEFAULT true NOT NULL,
	"notify_verification" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" varchar(255) NOT NULL,
	"user_agent" varchar(255),
	"expires_at" timestamp NOT NULL,
	"revoked" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "businesses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"company_name" varchar(255),
	"sector" varchar(100),
	"city" varchar(100),
	"description" text,
	"udyam_number" varchar(50),
	"gst_number" varchar(50),
	"shop_act_license" varchar(50),
	"verification_tier" "verification_tier" DEFAULT 'unverified' NOT NULL,
	"funding_ask" numeric,
	"years_operating" integer,
	"is_profile_complete" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "investor_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"pan_number" varchar(20),
	"firm_name" varchar(255),
	"investment_focus" varchar(255),
	"preferred_geography" varchar(255),
	"min_ticket_size" numeric,
	"max_ticket_size" numeric,
	"is_identity_verified" boolean DEFAULT false NOT NULL,
	"is_complete" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "follows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"follower_id" uuid NOT NULL,
	"target_type" "follow_target_type" NOT NULL,
	"target_user_id" uuid,
	"target_business_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "follow_target_consistency" CHECK ((
        ("follows"."target_type" = 'business' AND "follows"."target_business_id" IS NOT NULL AND "follows"."target_user_id" IS NULL)
        OR
        ("follows"."target_type" = 'investor' AND "follows"."target_user_id" IS NOT NULL AND "follows"."target_business_id" IS NULL)
      ))
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"actor_id" uuid,
	"type" "notification_type" NOT NULL,
	"title" varchar(255) NOT NULL,
	"body" text,
	"metadata" jsonb,
	"is_read" boolean DEFAULT false NOT NULL,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"participant_a_id" uuid NOT NULL,
	"participant_b_id" uuid NOT NULL,
	"last_message_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "conversation_ordered_pair" CHECK ("conversations"."participant_a_id" < "conversations"."participant_b_id")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sender_id" uuid NOT NULL,
	"body" text NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profile_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"viewer_id" uuid NOT NULL,
	"viewed_id" uuid NOT NULL,
	"view_count" integer DEFAULT 1 NOT NULL,
	"last_viewed_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "no_self_view" CHECK ("profile_views"."viewer_id" <> "profile_views"."viewed_id")
);
--> statement-breakpoint
CREATE TABLE "readiness_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"score" integer NOT NULL,
	"model_version" varchar(50) NOT NULL,
	"shap_breakdown" jsonb NOT NULL,
	"suggestions" jsonb,
	"sector" varchar(100),
	"stage" varchar(50),
	"computed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profile_edit_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"edited_by_id" uuid,
	"field_name" varchar(100) NOT NULL,
	"old_value" text,
	"new_value" text,
	"field_type" varchar(30) DEFAULT 'string',
	"changed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"investor_id" uuid NOT NULL,
	"match_score" integer NOT NULL,
	"match_reasons" jsonb NOT NULL,
	"model_version" varchar(50) DEFAULT 'rules-v1' NOT NULL,
	"status" "match_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "no_self_match" CHECK ("matches"."business_id" <> "matches"."investor_id")
);
--> statement-breakpoint
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
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investor_profiles" ADD CONSTRAINT "investor_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_follower_id_users_id_fk" FOREIGN KEY ("follower_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_target_business_id_businesses_id_fk" FOREIGN KEY ("target_business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_participant_a_id_users_id_fk" FOREIGN KEY ("participant_a_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_participant_b_id_users_id_fk" FOREIGN KEY ("participant_b_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_views" ADD CONSTRAINT "profile_views_viewer_id_users_id_fk" FOREIGN KEY ("viewer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_views" ADD CONSTRAINT "profile_views_viewed_id_users_id_fk" FOREIGN KEY ("viewed_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "readiness_scores" ADD CONSTRAINT "readiness_scores_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_edit_history" ADD CONSTRAINT "profile_edit_history_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_edit_history" ADD CONSTRAINT "profile_edit_history_edited_by_id_users_id_fk" FOREIGN KEY ("edited_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_investor_id_users_id_fk" FOREIGN KEY ("investor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pitches" ADD CONSTRAINT "pitches_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "business_owner_idx" ON "businesses" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "business_sector_idx" ON "businesses" USING btree ("sector");--> statement-breakpoint
CREATE INDEX "business_verification_idx" ON "businesses" USING btree ("verification_tier");--> statement-breakpoint
CREATE UNIQUE INDEX "investor_user_idx" ON "investor_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_user_follow_idx" ON "follows" USING btree ("follower_id","target_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_business_follow_idx" ON "follows" USING btree ("follower_id","target_business_id");--> statement-breakpoint
CREATE INDEX "follow_follower_idx" ON "follows" USING btree ("follower_id");--> statement-breakpoint
CREATE INDEX "follow_target_user_idx" ON "follows" USING btree ("target_user_id");--> statement-breakpoint
CREATE INDEX "follow_target_business_idx" ON "follows" USING btree ("target_business_id");--> statement-breakpoint
CREATE INDEX "notif_user_created_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "notif_user_unread_idx" ON "notifications" USING btree ("user_id","is_read");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_conversation_pair_idx" ON "conversations" USING btree ("participant_a_id","participant_b_id");--> statement-breakpoint
CREATE INDEX "conv_participant_a_idx" ON "conversations" USING btree ("participant_a_id");--> statement-breakpoint
CREATE INDEX "conv_participant_b_idx" ON "conversations" USING btree ("participant_b_id");--> statement-breakpoint
CREATE INDEX "msg_conv_created_idx" ON "messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "msg_unread_idx" ON "messages" USING btree ("conversation_id","is_read");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_profile_view_idx" ON "profile_views" USING btree ("viewer_id","viewed_id");--> statement-breakpoint
CREATE INDEX "pv_viewer_recent_idx" ON "profile_views" USING btree ("viewer_id","last_viewed_at");--> statement-breakpoint
CREATE INDEX "pv_viewed_idx" ON "profile_views" USING btree ("viewed_id");--> statement-breakpoint
CREATE INDEX "rs_business_recent_idx" ON "readiness_scores" USING btree ("business_id","computed_at");--> statement-breakpoint
CREATE INDEX "rs_benchmark_idx" ON "readiness_scores" USING btree ("sector","computed_at");--> statement-breakpoint
CREATE INDEX "peh_business_recent_idx" ON "profile_edit_history" USING btree ("business_id","changed_at");--> statement-breakpoint
CREATE INDEX "peh_field_idx" ON "profile_edit_history" USING btree ("business_id","field_name");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_match_pair_idx" ON "matches" USING btree ("business_id","investor_id");--> statement-breakpoint
CREATE INDEX "match_investor_score_idx" ON "matches" USING btree ("investor_id","match_score");--> statement-breakpoint
CREATE INDEX "match_business_score_idx" ON "matches" USING btree ("business_id","match_score");--> statement-breakpoint
CREATE INDEX "pitch_business_idx" ON "pitches" USING btree ("business_id","status");--> statement-breakpoint
CREATE INDEX "pitch_live_feed_idx" ON "pitches" USING btree ("status","published_at");--> statement-breakpoint
CREATE INDEX "pitch_stage_revenue_idx" ON "pitches" USING btree ("status","stage","revenue_range");