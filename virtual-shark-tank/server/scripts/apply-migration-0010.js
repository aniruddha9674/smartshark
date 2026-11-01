import dotenv from "dotenv";
dotenv.config();
import fs from "node:fs";
import crypto from "node:crypto";
import { pool } from "../src/config/db.postgres.js";

const sqlPath = "drizzle/0010_simple_stark_industries.sql";
const sqlText = fs.readFileSync(sqlPath, "utf8");
const hash = crypto.createHash("sha256").update(sqlText).digest("hex");

console.log(`File: ${sqlPath}`);
console.log(`Hash: ${hash.slice(0, 16)}...\n`);

// Already recorded?
const { rows: existing } = await pool.query(
  `SELECT id FROM drizzle.__drizzle_migrations WHERE hash = $1`,
  [hash]
);
if (existing.length > 0) {
  console.log(`✓ Already applied (id=${existing[0].id})`);
  await pool.end();
  process.exit(0);
}

const statements = sqlText
  .split("--> statement-breakpoint")
  .map((s) => s.trim())
  .filter(Boolean);

console.log(`Applying ${statements.length} statements...\n`);

let ok = 0, skipped = 0, failed = 0;
const failures = [];

for (let i = 0; i < statements.length; i++) {
  const stmt = statements[i];
  try {
    await pool.query(stmt);
    ok++;
  } catch (err) {
    const m = err.message || "";
    if (
      m.includes("already exists") ||
      m.includes("duplicate") ||
      m.includes("already nullable")
    ) {
      skipped++;
    } else {
      failed++;
      failures.push({ index: i + 1, error: m, snippet: stmt.slice(0, 150) });
    }
  }
}

console.log(`Applied:  ${ok}`);
console.log(`Skipped:  ${skipped}`);
console.log(`Failed:   ${failed}\n`);

if (failed > 0) {
  console.log("=== Failures ===");
  for (const f of failures) {
    console.log(`\n[${f.index}] ${f.error}`);
    console.log(`  ${f.snippet}`);
  }
  await pool.end();
  process.exit(1);
}

await pool.query(
  `INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)`,
  [hash, Date.now()]
);
console.log(`✓ Recorded in __drizzle_migrations`);
console.log(`Future npm run migrate will skip this and continue from 0011.`);

await pool.end();