import { runJob } from "../src/cli/runJob.js";
import { db } from "../src/config/db.postgres.js";
import { pitches, businesses } from "../src/models/postgres/index.js";
import { eq, sql } from "drizzle-orm";

runJob("check-pitches", async () => {
  const stats = await db.execute(sql`
    SELECT status, COUNT(*)::int AS count
    FROM pitches
    GROUP BY status
  `);
  console.table(stats.rows);

  const sample = await db
    .select({
      title: pitches.title,
      ask: pitches.askAmount,
      equity: pitches.equityOffered,
      valuation: pitches.valuation,
      status: pitches.status,
      businessId: pitches.businessId,
    })
    .from(pitches)
    .limit(5);
  console.table(sample);

  return { pitches: stats.rows.reduce((s, r) => s + r.count, 0) };
});