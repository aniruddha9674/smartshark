import dotenv from "dotenv";
dotenv.config();

import { db, pool } from "../src/config/db.postgres.js";
import { sql } from "drizzle-orm";

const count = await db.execute(sql`SELECT COUNT(*)::int AS n FROM pitches`);
console.log("Total pitches in DB:", count.rows[0].n);

const byStatus = await db.execute(sql`
  SELECT status, COUNT(*)::int AS n FROM pitches GROUP BY status
`);
console.log("By status:", byStatus.rows);

const businesses = await db.execute(sql`
  SELECT COUNT(*)::int AS n FROM businesses WHERE is_external = true
`);
console.log("External businesses:", businesses.rows[0].n);

await pool.end();