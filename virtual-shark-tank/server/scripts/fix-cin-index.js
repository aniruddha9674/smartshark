import dotenv from "dotenv";
dotenv.config();

import { db, pool } from "../src/config/db.postgres.js";
import { sql } from "drizzle-orm";

const run = async () => {
  console.log("=== Current cin indexes ===");
  const idx = await db.execute(sql`
    SELECT indexname, indexdef FROM pg_indexes
    WHERE tablename = 'businesses' AND indexdef LIKE '%cin%'
  `);
  console.table(idx.rows);

  console.log("\n=== Duplicate check ===");
  const dup = await db.execute(sql`
    SELECT cin, COUNT(*)::int AS n FROM businesses
    WHERE cin IS NOT NULL
    GROUP BY cin HAVING COUNT(*) > 1
  `);
  if (dup.rows.length > 0) {
    console.error("Duplicates found — cannot create unique index:");
    console.table(dup.rows);
    await pool.end();
    return;
  }
  console.log("  no duplicates");

  console.log("\n=== Dropping partial index ===");
  await db.execute(sql`DROP INDEX IF EXISTS businesses_cin_unique`);
  console.log("  dropped");

  console.log("\n=== Creating full unique index ===");
  await db.execute(sql`CREATE UNIQUE INDEX businesses_cin_unique ON businesses (cin)`);
  console.log("  created");

  console.log("\n=== Verifying ON CONFLICT works ===");
  try {
    await db.execute(sql`
      EXPLAIN INSERT INTO businesses (cin, company_name, data_source, is_external, is_profile_complete, verification_tier, enrichment_status, created_at, updated_at)
      VALUES ('TESTCIN', 'test', 'mca', true, false, 'unverified', 'pending', NOW(), NOW())
      ON CONFLICT (cin) DO NOTHING
    `);
    console.log("  ✓ ON CONFLICT accepted");
  } catch (err) {
    console.error("  ✗ ON CONFLICT rejected:", err.message);
    if (err.cause) console.error("  cause:", err.cause.message);
  }

  console.log("\n=== Final index state ===");
  const idx2 = await db.execute(sql`
    SELECT indexname, indexdef FROM pg_indexes
    WHERE tablename = 'businesses' AND indexname = 'businesses_cin_unique'
  `);
  console.table(idx2.rows);

  await pool.end();
};

run().catch((err) => {
  console.error("Fatal:", err.message);
  if (err.cause) console.error("Cause:", err.cause.message);
  process.exit(1);
});