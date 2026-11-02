import dotenv from "dotenv";
dotenv.config();
import { pool } from "../src/config/db.postgres.js";
import { recomputeForInvestor } from "../src/services/match.service.js";

const { rows } = await pool.query(
  `SELECT user_id FROM investor_profiles ORDER BY created_at ASC LIMIT 1`
);

if (rows.length === 0) {
  console.error("No investor profile found");
  process.exit(1);
}

const investorId = rows[0].user_id;
console.log(`Recomputing matches for investor: ${investorId}`);
console.time("recompute");
const result = await recomputeForInvestor(investorId);
console.timeEnd("recompute");
console.log(result);

await pool.end();