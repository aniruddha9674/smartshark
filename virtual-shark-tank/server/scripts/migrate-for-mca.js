import dotenv from "dotenv";
dotenv.config();

import { db, pool } from "../src/config/db.postgres.js";
import { sql } from "drizzle-orm";

const run = async () => {
  console.log("Step 1: check owner_id nullability");
  const r = await db.execute(
    sql`SELECT is_nullable FROM information_schema.columns WHERE table_name = 'businesses' AND column_name = 'owner_id'`
  );
  const row = r.rows[0];
  if (row && row.is_nullable === "NO") {
    console.log("  owner_id is NOT NULL — dropping constraint");
    await db.execute(sql`ALTER TABLE businesses ALTER COLUMN owner_id DROP NOT NULL`);
    console.log("  done");
  } else {
    console.log("  owner_id already nullable");
  }

  console.log("\nStep 2: create raw_mca_records");
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS raw_mca_records (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      cin TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      payload JSONB NOT NULL,
      state_file TEXT,
      ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (cin, content_hash)
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS raw_mca_records_cin_idx ON raw_mca_records (cin)`);
  console.log("  done");

  console.log("\nStep 3: add MCA columns to businesses");
  const columns = [
    ["cin", "TEXT"],
    ["nic_code", "TEXT"],
    ["industrial_classification", "TEXT"],
    ["listing_status", "TEXT"],
    ["company_class", "TEXT"],
    ["company_category", "TEXT"],
    ["company_sub_category", "TEXT"],
    ["company_roc", "TEXT"],
    ["company_status", "TEXT"],
    ["authorized_capital", "NUMERIC"],
    ["paid_up_capital", "NUMERIC"],
    ["registered_address", "TEXT"],
    ["pincode", "TEXT"],
    ["incorporation_date", "DATE"],
    ["country", "TEXT"],
    ["data_source", "TEXT DEFAULT 'user'"],
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

  console.log("\nStep 4: unique index on cin (only if not already present)");
  try {
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS businesses_cin_unique ON businesses (cin) WHERE cin IS NOT NULL`);
    console.log("  done");
  } catch (err) {
    console.log("  failed:", err.message);
  }

  console.log("\nStep 5: other indexes");
  await db.execute(sql`CREATE INDEX IF NOT EXISTS businesses_status_idx ON businesses (company_status)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS businesses_state_idx ON businesses (state)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS businesses_nic_idx ON businesses (nic_code)`);
  console.log("  done");

  await pool.end();
};

run().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});