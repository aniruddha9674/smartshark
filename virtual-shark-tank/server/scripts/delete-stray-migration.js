import dotenv from "dotenv";
dotenv.config();
import { pool } from "../src/config/db.postgres.js";

const run = async () => {
  const { rows: before } = await pool.query(`SELECT COUNT(*)::int AS n FROM drizzle.__drizzle_migrations`);
  console.log(`Before: ${before[0].n} rows`);

  const { rows: max } = await pool.query(`SELECT MAX(id)::int AS max_id FROM drizzle.__drizzle_migrations`);
  console.log(`Max id: ${max[0].max_id}`);

  const { rowCount } = await pool.query(
    `DELETE FROM drizzle.__drizzle_migrations WHERE id = $1`,
    [max[0].max_id]
  );
  console.log(`Deleted: ${rowCount} row(s) with id = ${max[0].max_id}`);

  const { rows: after } = await pool.query(`SELECT COUNT(*)::int AS n FROM drizzle.__drizzle_migrations`);
  console.log(`After:  ${after[0].n} rows`);

  await pool.end();
};

run().catch(console.error);