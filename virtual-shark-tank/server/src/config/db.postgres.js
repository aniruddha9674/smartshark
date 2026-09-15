import { drizzle } from "drizzle-orm/node-postgres";
import pkg from "pg";
import { env } from "./env.js";
import * as schema from "../models/postgres/index.js";

const { Pool } = pkg;

let db;
let pool = null;

if (process.env.NODE_ENV === "test") {
  db = global.__testDb;
} else {
  pool = new Pool({
    connectionString: env.postgresUri,
    ssl: { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 15000,
    family: 4,                        // ← FORCE IPv4 (fixes ENOTFOUND on Jio)
  });

  db = drizzle(pool, { schema });
}

export { db };

export const testConnection = async () => {
  if (process.env.NODE_ENV === "test") return;

  try {
    const client = await pool.connect();
    await client.query("SELECT 1");
    client.release();
    console.log("Postgres connected");
  } catch (err) {
    console.error("Postgres connection failed:", err.message);
    process.exit(1);
  }
};