CREATE TABLE IF NOT EXISTS "profile_edit_history" (
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
DO $$ BEGIN
 ALTER TABLE "profile_edit_history" ADD CONSTRAINT "profile_edit_history_business_id_users_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "profile_edit_history" ADD CONSTRAINT "profile_edit_history_edited_by_id_users_id_fk" FOREIGN KEY ("edited_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "peh_business_recent_idx" ON "profile_edit_history" USING btree ("business_id","changed_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "peh_field_idx" ON "profile_edit_history" USING btree ("business_id","field_name");