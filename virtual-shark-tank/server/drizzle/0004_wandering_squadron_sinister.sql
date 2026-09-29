CREATE TABLE "rejected_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempted_type" varchar(50) NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"sample_user_id" uuid,
	"first_seen_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rejected_events" ADD CONSTRAINT "rejected_events_sample_user_id_users_id_fk" FOREIGN KEY ("sample_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "rejected_event_type_unique" ON "rejected_events" USING btree ("attempted_type");