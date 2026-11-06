import { PgBoss } from "pg-boss";
import { env } from "./env.js";

// Singleton — one boss instance per process.
// The API server and the worker both import this, but only the worker calls .work().
// Both call .start() so both can enqueue (the API enqueues, the worker consumes).

let bossInstance = null;

export async function getBoss() {
  if (bossInstance) return bossInstance;

    const connectionString = env.postgresUri;

  if (!connectionString) {
    throw new Error(
      "[pg-boss] No Postgres connection string found. " +
      "Check that .env has POSTGRES_URI set and env.js exports it as postgresUri."
    );
  }

  bossInstance = new PgBoss({
    connectionString,
    schema: "pgboss",
    retentionDays: 3,
    max: 3,
  });

  await bossInstance.start();

  // pg-boss v10 requires explicit queue creation.
  // Two queues: wizard (high priority, rare) and batch (low priority, 13k jobs).
  // Separate queues mean batch can't starve wizard jobs even under load.
  await bossInstance.createQueue("profile-draft-wizard");
  await bossInstance.createQueue("profile-draft-batch");

  console.log("[pg-boss] started, queues ready");
  return bossInstance;
}

export async function stopBoss() {
  if (!bossInstance) return;
  await bossInstance.stop({ graceful: true, wait: true });
  bossInstance = null;
}