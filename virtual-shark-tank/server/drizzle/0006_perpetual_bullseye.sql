CREATE TYPE "public"."import_status" AS ENUM('pending', 'importing', 'importing_done', 'harmonizing', 'done', 'failed');--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_name" varchar(100) NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"file_size_bytes" integer,
	"total_rows" integer DEFAULT 0,
	"processed_rows" integer DEFAULT 0,
	"failed_rows" integer DEFAULT 0,
	"status" "import_status" DEFAULT 'pending' NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE "raw_import_businesses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"source_row_index" integer NOT NULL,
	"raw_data" jsonb NOT NULL,
	"imported_at" timestamp DEFAULT now() NOT NULL,
	"processed_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "raw_import_businesses" ADD CONSTRAINT "raw_import_businesses_batch_id_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."import_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "raw_batch_idx" ON "raw_import_businesses" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "raw_unprocessed_idx" ON "raw_import_businesses" USING btree ("processed_at");