CREATE TABLE "business_charges" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "business_charges_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"business_id" uuid NOT NULL,
	"charge_id" varchar(50),
	"holder_name" varchar(255),
	"amount" numeric,
	"creation_date" date,
	"status" varchar(30),
	"source" varchar(30) DEFAULT 'mca' NOT NULL,
	"fetched_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_directors" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "business_directors_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"business_id" uuid NOT NULL,
	"din" varchar(8) NOT NULL,
	"name" varchar(255) NOT NULL,
	"appointed_at" date,
	"is_active" boolean DEFAULT true NOT NULL,
	"source" varchar(30) DEFAULT 'mca' NOT NULL,
	"fetched_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_evidence_claims" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "business_evidence_claims_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"business_id" uuid NOT NULL,
	"claim_type" varchar(50) NOT NULL,
	"claimed_value" numeric,
	"claimed_period" varchar(30),
	"evidence_tier" varchar(30) DEFAULT 'claimed' NOT NULL,
	"corroborating_sources" jsonb DEFAULT '[]'::jsonb,
	"discrepancy_pct" numeric,
	"last_checked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_media" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "business_media_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"business_id" uuid NOT NULL,
	"url" varchar(1000) NOT NULL,
	"public_id" varchar(255),
	"media_type" varchar(30) NOT NULL,
	"caption" varchar(300),
	"display_order" integer DEFAULT 0 NOT NULL,
	"uploaded_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "business_charges" ADD CONSTRAINT "business_charges_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_directors" ADD CONSTRAINT "business_directors_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_evidence_claims" ADD CONSTRAINT "business_evidence_claims_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_media" ADD CONSTRAINT "business_media_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_media" ADD CONSTRAINT "business_media_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "business_charges_business_idx" ON "business_charges" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "business_directors_business_idx" ON "business_directors" USING btree ("business_id");--> statement-breakpoint
CREATE UNIQUE INDEX "business_directors_din_unique" ON "business_directors" USING btree ("business_id","din");--> statement-breakpoint
CREATE INDEX "business_evidence_claims_business_idx" ON "business_evidence_claims" USING btree ("business_id","claim_type");--> statement-breakpoint
CREATE INDEX "business_evidence_claims_tier_idx" ON "business_evidence_claims" USING btree ("evidence_tier");--> statement-breakpoint
CREATE INDEX "business_media_business_idx" ON "business_media" USING btree ("business_id","display_order");--> statement-breakpoint
CREATE INDEX "business_media_type_idx" ON "business_media" USING btree ("media_type");