ALTER TABLE "businesses" ADD COLUMN "website_url" varchar(500);--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "logo_url" varchar(1000);--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "cover_image_url" varchar(1000);--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "enrichment_status" varchar(20) DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "enriched_at" timestamp;--> statement-breakpoint
CREATE INDEX "business_enrichment_status_idx" ON "businesses" USING btree ("enrichment_status");