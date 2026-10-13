import { afterAll, beforeAll, afterEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { drizzle } from "drizzle-orm/pglite";
import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import * as schema from "../src/models/postgres/index.js";

process.env.CLOUDINARY_CLOUD_NAME ||= "ci-dummy";
process.env.CLOUDINARY_API_KEY ||= "000000000000000";
process.env.CLOUDINARY_API_SECRET ||= "ci-dummy-secret";

// ═══════════════════════════════════════════════════════════════
// POSTGRES — created at import time so global.__testDb is ready
// before any test file grabs it. Never closed (workers may reuse).
// ═══════════════════════════════════════════════════════════════
const pgClient = new PGlite({ extensions: { pg_trgm } });
await pgClient.exec("CREATE EXTENSION IF NOT EXISTS pg_trgm");

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

// ═══════════════════════════════════════════════════════════════
// MONGODB — in-memory via mongodb-memory-server
// ═══════════════════════════════════════════════════════════════
let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
  console.log("Test Mongo ready");
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});

afterAll(async () => {
  // NOTE: pgClient is intentionally NOT closed here.
  // Vitest may reuse the worker across files; closing it breaks the next file.
  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
});