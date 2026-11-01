import dotenv from "dotenv";
dotenv.config();

import { db, pool } from "../src/config/db.postgres.js";
import { sql } from "drizzle-orm";

const run = async () => {
  const columns = [
    // Needed for ingest
    ["state", "VARCHAR(100)"],
    ["is_profile_complete", "BOOLEAN DEFAULT false NOT NULL"],
    ["created_at", "TIMESTAMPTZ DEFAULT NOW() NOT NULL"],
    ["updated_at", "TIMESTAMPTZ DEFAULT NOW() NOT NULL"],

    // Needed for the feed UI later (adding now so they're ready)
    ["description", "TEXT"],
    ["funding_ask", "NUMERIC"],
    ["years_operating", "INTEGER"],
    ["verification_tier", "VARCHAR(20) DEFAULT 'unverified' NOT NULL"],
    ["udyam_number", "VARCHAR(50)"],
    ["gst_number", "VARCHAR(50)"],
    ["shop_act_license", "VARCHAR(50)"],
    ["website_url", "VARCHAR(500)"],
    ["logo_url", "VARCHAR(1000)"],
    ["cover_image_url", "VARCHAR(1000)"],
    ["enrichment_status", "VARCHAR(20) DEFAULT 'pending' NOT NULL"],
    ["enriched_at", "TIMESTAMPTZ"],
    ["source_batch_id", "UUID"],
    ["source_row_id", "UUID"],
  ];

  for (const [name, type] of columns) {
    try {
      await db.execute(
        sql.raw(`ALTER TABLE businesses ADD COLUMN IF NOT EXISTS ${name} ${type}`)
      );
      console.log(`  ${name} ✓`);
    } catch (err) {
      console.log(`  ${name} — ${err.message}`);
    }
  }

  console.log("\nIndexes:");
  const indexes = [
    "CREATE INDEX IF NOT EXISTS businesses_state_idx ON businesses (state)",
    "CREATE INDEX IF NOT EXISTS businesses_sector_idx ON businesses (sector)",
    "CREATE INDEX IF NOT EXISTS businesses_nic_idx ON businesses (nic_code)",
    "CREATE INDEX IF NOT EXISTS businesses_enrichment_idx ON businesses (enrichment_status)",
  ];
  for (const idx of indexes) {
    try {
      await db.execute(sql.raw(idx));
      console.log(`  ${idx.split(" ON ")[0].replace("CREATE INDEX IF NOT EXISTS ", "")} ✓`);
    } catch (err) {
      console.log(`  failed: ${err.message}`);
    }
  }

  await pool.end();
};

run().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});