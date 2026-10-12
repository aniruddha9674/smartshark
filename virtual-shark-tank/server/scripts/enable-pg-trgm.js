import dotenv from "dotenv";
dotenv.config();

import { db, pool } from "../src/config/db.postgres.js";
import { sql } from "drizzle-orm";

const run = async () => {
  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
  console.log("pg_trgm enabled");

  const result = await db.execute(
    sql`SELECT extname FROM pg_extension WHERE extname = 'pg_trgm'`
  );
  console.log("Verified:", result.rows);

  await pool.end();
};

run().catch((err) => {
  console.error("Failed:", err.message);
  process.exit(1);
});