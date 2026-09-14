CREATE TABLE IF NOT EXISTS "readiness_scores" (
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
DO $$ BEGIN
 ALTER TABLE "readiness_scores" ADD CONSTRAINT "readiness_scores_business_id_users_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rs_business_recent_idx" ON "readiness_scores" USING btree ("business_id","computed_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rs_benchmark_idx" ON "readiness_scores" USING btree ("sector","computed_at");