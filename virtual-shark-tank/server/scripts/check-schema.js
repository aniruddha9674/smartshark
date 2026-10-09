import { runJob } from "../src/cli/runJob.js";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

runJob("check-schema", async () => {
  // This one is special — it uses PGlite, not the real DB.
  // It bypasses pool.end() (harmless — pool was never connected).
  process.env.NODE_ENV = "test";

  const pg = new PGlite();
  const dir = path.resolve("drizzle");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

  for (const f of files) {
    const text = fs.readFileSync(path.join(dir, f), "utf-8");
    for (const stmt of text.split("--> statement-breakpoint")) {
      const t = stmt.trim();
      if (!t) continue;
      try {
        await pg.exec(t);
      } catch (e) {
        if (!e.message?.includes("already exists")) throw e;
      }
    }
  }

  const { rows: columns } = await pg.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'businesses' ORDER BY column_name"
  );
  console.log("\n=== businesses columns ===");
  console.log(columns.map((c) => `  - ${c.column_name}`).join("\n"));

  const { rows: tables } = await pg.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
  );
  console.log("\n=== tables ===");
  console.log(tables.map((t) => `  - ${t.table_name}`).join("\n"));

  await pg.close();
  return { tables: tables.length, columns: columns.length };
});