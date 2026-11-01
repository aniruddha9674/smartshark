import fs from "node:fs";
import path from "node:path";

// ─── 1. Rewrite _journal.json with the correct idx 10 entry ─────
const journalPath = path.resolve("drizzle/meta/_journal.json");
const journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));

// Ensure idx 10 has tag + breakpoints
const idx10 = journal.entries.find((e) => e.idx === 10);
if (!idx10) {
  console.error("Journal is missing idx 10 — abort");
  process.exit(1);
}
idx10.tag = "0010_simple_stark_industries";
idx10.breakpoints = true;
delete idx10[""]; // in case of stray key

fs.writeFileSync(journalPath, JSON.stringify(journal, null, 2) + "\n");
console.log(`✓ Fixed ${journalPath}`);
console.log(`  idx 10 → tag: "${idx10.tag}", breakpoints: ${idx10.breakpoints}`);
console.log(`  Total entries: ${journal.entries.length}`);

// ─── 2. Rewrite 0010 SQL with IF NOT EXISTS guards ─────────────
const sqlPath = path.resolve("drizzle/0010_simple_stark_industries.sql");

const patchedSQL = `DO $$ BEGIN
  CREATE TYPE "public"."funding_instrument" AS ENUM('equity', 'debt', 'revenue_share', 'hybrid');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."revenue_trend" AS ENUM('declining', 'flat', 'growing_20', 'growing_50', 'growing_100');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "businesses" ALTER COLUMN "owner_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "cin" varchar(21);
--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "company_roc" varchar(100);
--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "company_category" varchar(100);
--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "company_sub_category" varchar(100);
--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "company_class" varchar(50);
--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "company_status" varchar(50);
--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "listing_status" varchar(50);
--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "authorized_capital" numeric;
--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "paid_up_capital" numeric;
--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "incorporation_date" date;
--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "registered_address" text;
--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "country" varchar(100);
--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "nic_code" varchar(10);
--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "industrial_classification" varchar(255);
--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "state" varchar(100);
--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "pincode" varchar(10);
--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "tagline" varchar(300);
--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "business_model" varchar(100);
--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "target_market" varchar(200);
--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "key_products" jsonb DEFAULT '[]'::jsonb;
--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "notable_clients" jsonb DEFAULT '[]'::jsonb;
--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "differentiation" text;
--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "competitors" jsonb DEFAULT '[]'::jsonb;
--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "employee_count" integer;
--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "employee_count_source" varchar(30);
--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "funding_instrument" "funding_instrument";
--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "use_of_funds" jsonb DEFAULT '[]'::jsonb;
--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "planned_milestones" jsonb DEFAULT '[]'::jsonb;
--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "revenue_range" varchar(50);
--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "revenue_source" varchar(30);
--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "revenue_trend_bracket" "revenue_trend";
--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "customer_count" integer;
--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "repeat_customer_pct" numeric;
--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "monthly_order_volume" integer;
--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "prior_funding" jsonb DEFAULT '[]'::jsonb;
--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "existing_loans" jsonb DEFAULT '[]'::jsonb;
--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "licenses" jsonb DEFAULT '[]'::jsonb;
--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "self_declared_risks" text;
--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "litigation_notes" text;
--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "linkedin_url" varchar(500);
--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "twitter_url" varchar(500);
--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "pitch_video_url" varchar(500);
--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "current_readiness_score" integer;
--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "field_provenance" jsonb DEFAULT '{}'::jsonb;
--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "profile_completeness_pct" integer DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "data_source" varchar(30) DEFAULT 'user';
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "businesses_cin_unique" ON "businesses" USING btree ("cin");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "businesses_state_idx" ON "businesses" USING btree ("state");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "businesses_nic_idx" ON "businesses" USING btree ("nic_code");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "businesses_status_idx" ON "businesses" USING btree ("company_status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "businesses_data_source_idx" ON "businesses" USING btree ("data_source");
`;

fs.writeFileSync(sqlPath, patchedSQL);
console.log(`\n✓ Patched ${sqlPath}`);
console.log(`  ${patchedSQL.split("--> statement-breakpoint").length - 1} statements with IF NOT EXISTS guards`);

console.log(`\nReady. Run: npm run migrate`);