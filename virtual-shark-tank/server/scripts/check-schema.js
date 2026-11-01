import dotenv from "dotenv";
dotenv.config();

import { db, pool } from "../src/config/db.postgres.js";
import { sql } from "drizzle-orm";

const q = async (label, query) => {
  console.log(`\n=== ${label} ===`);
  const r = await db.execute(query);
  console.table(r.rows);
};

const run = async () => {
  await q(
    "businesses columns",
    sql`SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'businesses'
          AND column_name IN ('owner_id','cin','nic_code','company_status','registered_address','sector','city','state','pincode','authorized_capital','paid_up_capital','incorporation_date','data_source','is_external','listing_status','company_class','company_category','company_sub_category','industrial_classification','country','company_name')
        ORDER BY column_name`
  );

  await q(
    "raw_mca_records exists?",
    sql`SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'raw_mca_records') AS exists`
  );

  await pool.end();
};

run().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});