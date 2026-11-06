import "dotenv/config";
import { env } from "./config/env.js";
import { db } from "./config/db.postgres.js";
import { sql } from "drizzle-orm";
import { getBoss, stopBoss } from "./config/pgBoss.js";
import { startProfileDraftWorkers } from "./workers/profileDraft.worker.js";

async function main() {
  console.log("[worker] starting, NODE_ENV:", env.nodeEnv || "development");

  // Neon free tier suspends after 5 min idle. Warm up before boss starts.
  // Same pattern as scripts/ingest-mca.js and scripts/enrich-investable.js.
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      await db.execute(sql`SELECT 1`);
      break;
    } catch (err) {
      console.warn(`[worker] DB warm-up attempt ${attempt} failed:`, err.message);
      if (attempt === 5) throw err;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  await getBoss();
  await startProfileDraftWorkers();

  console.log("[worker] ready");

  // Graceful shutdown — finish in-flight jobs, then exit.
  const shutdown = async (signal) => {
    console.log(`[worker] received ${signal}, shutting down gracefully…`);
    await stopBoss();
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("[worker] fatal:", err);
  process.exit(1);
});