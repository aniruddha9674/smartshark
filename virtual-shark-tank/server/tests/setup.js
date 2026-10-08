import { afterAll, beforeAll, afterEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import * as schema from "../src/models/postgres/index.js";

// ═══════════════════════════════════════════════════════════════
// POSTGRES — in-memory via PGlite
// ═══════════════════════════════════════════════════════════════
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

// ═══════════════════════════════════════════════════════════════
// TEARDOWN
// ═══════════════════════════════════════════════════════════════
afterAll(async () => {
  await pgClient.close();
  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
});