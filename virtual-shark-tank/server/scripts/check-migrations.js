import dotenv from "dotenv";
dotenv.config();
import { pool } from "../src/config/db.postgres.js";

const run = async () => {
  const { rows } = await pool.query(`
    SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at
  `).catch(async (err) => {
    if (err.message.includes("does not exist")) {
      console.log("__drizzle_migrations table does not exist yet");
      return { rows: [] };
    }
    throw err;
  });
  console.table(rows);
  await pool.end();
};

run().catch(console.error);