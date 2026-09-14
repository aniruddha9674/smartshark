CREATE TABLE IF NOT EXISTS "profile_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"viewer_id" uuid NOT NULL,
	"viewed_id" uuid NOT NULL,
	"view_count" integer DEFAULT 1 NOT NULL,
	"last_viewed_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "profile_views" ADD CONSTRAINT "profile_views_viewer_id_users_id_fk" FOREIGN KEY ("viewer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "profile_views" ADD CONSTRAINT "profile_views_viewed_id_users_id_fk" FOREIGN KEY ("viewed_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "unique_profile_view_idx" ON "profile_views" USING btree ("viewer_id","viewed_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pv_viewer_recent_idx" ON "profile_views" USING btree ("viewer_id","last_viewed_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pv_viewed_idx" ON "profile_views" USING btree ("viewed_id");