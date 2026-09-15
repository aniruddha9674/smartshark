import { afterAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import fs from "node:fs";
import path from "node:path";
import * as schema from "../src/models/postgres/index.js";

// ---- Top-level setup: runs BEFORE any test file is imported ----
const pgClient = new PGlite();

const drizzleDir = path.resolve("drizzle");
const files = fs
  .readdirSync(drizzleDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

for (const file of files) {
  const sqlText = fs.readFileSync(path.join(drizzleDir, file), "utf-8");
  const statements = sqlText.split("--> statement-breakpoint");
  for (const stmt of statements) {
    const trimmed = stmt.trim();
    if (!trimmed) continue;
    try {
      await pgClient.exec(trimmed);
    } catch (err) {
      if (!err.message?.includes("already exists")) throw err;
    }
  }
}

global.__testDb = drizzle(pgClient, { schema });
console.log(`Test DB ready (${files.length} migration files applied)`);

afterAll(async () => {
  await pgClient.close();
});