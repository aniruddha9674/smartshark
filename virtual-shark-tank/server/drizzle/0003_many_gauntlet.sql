CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"event_type" varchar(50) NOT NULL,
	"entity_type" varchar(50),
	"entity_id" uuid,
	"metadata" jsonb,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feed_impressions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"pitch_id" uuid NOT NULL,
	"surface" varchar(50) NOT NULL,
	"position" integer NOT NULL,
	"score" numeric,
	"model_version" varchar(50) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_impressions" ADD CONSTRAINT "feed_impressions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_impressions" ADD CONSTRAINT "feed_impressions_pitch_id_pitches_id_fk" FOREIGN KEY ("pitch_id") REFERENCES "public"."pitches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_user_recent_idx" ON "events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "event_entity_recent_idx" ON "events" USING btree ("entity_type","entity_id","created_at");--> statement-breakpoint
CREATE INDEX "event_type_recent_idx" ON "events" USING btree ("event_type","created_at");--> statement-breakpoint
CREATE INDEX "impression_user_recent_idx" ON "feed_impressions" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "impression_pitch_recent_idx" ON "feed_impressions" USING btree ("pitch_id","created_at");--> statement-breakpoint
CREATE INDEX "impression_dedup_idx" ON "feed_impressions" USING btree ("user_id","pitch_id","surface","created_at");