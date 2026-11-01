import dotenv from "dotenv";
dotenv.config();
import { pool } from "../src/config/db.postgres.js";

const run = async () => {
  await pool.query(`
    ALTER TABLE businesses
      ADD COLUMN IF NOT EXISTS domain_discovery_status VARCHAR(20) DEFAULT 'pending' NOT NULL,
      ADD COLUMN IF NOT EXISTS domain_discovery_attempted_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS domain_discovery_reason VARCHAR(50)
  `);
  console.log("✓ columns added");

  // Index for the top-down query — partial index because we only ever scan 'pending'
  await pool.query(`
    CREATE INDEX IF NOT EXISTS businesses_discovery_pending_idx
    ON businesses (authorized_capital DESC NULLS LAST)
    WHERE domain_discovery_status = 'pending'
  `);
  console.log("✓ index created");

  // Mark already-done rows as 'found' so they're not retried
  await pool.query(`
    UPDATE businesses
    SET domain_discovery_status = 'found'
    WHERE website_url IS NOT NULL AND domain_discovery_status = 'pending'
  `);
  console.log("✓ existing rows reconciled");

  const { rows } = await pool.query(`
    SELECT domain_discovery_status AS status, COUNT(*)::int AS n
    FROM businesses
    WHERE data_source = 'mca' AND company_status = 'Active'
    GROUP BY domain_discovery_status
  `);
  console.table(rows);

  await pool.end();
};

run().catch((err) => { console.error(err); process.exit(1); });