CREATE TABLE "harmonization_errors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"raw_row_id" uuid NOT NULL,
	"error_type" varchar(50) NOT NULL,
	"field_name" varchar(100),
	"message" text NOT NULL,
	"raw_data" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "is_external" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "source_batch_id" uuid;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "source_row_id" uuid;--> statement-breakpoint
ALTER TABLE "harmonization_errors" ADD CONSTRAINT "harmonization_errors_batch_id_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."import_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "harmonization_errors" ADD CONSTRAINT "harmonization_errors_raw_row_id_raw_import_businesses_id_fk" FOREIGN KEY ("raw_row_id") REFERENCES "public"."raw_import_businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "harm_err_batch_idx" ON "harmonization_errors" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "harm_err_type_idx" ON "harmonization_errors" USING btree ("error_type");--> statement-breakpoint
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_source_batch_id_import_batches_id_fk" FOREIGN KEY ("source_batch_id") REFERENCES "public"."import_batches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_source_row_id_raw_import_businesses_id_fk" FOREIGN KEY ("source_row_id") REFERENCES "public"."raw_import_businesses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "business_is_external_idx" ON "businesses" USING btree ("is_external");--> statement-breakpoint
CREATE INDEX "business_source_batch_idx" ON "businesses" USING btree ("source_batch_id");