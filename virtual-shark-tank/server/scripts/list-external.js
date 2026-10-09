import { runJob, intArg } from "../src/cli/runJob.js";
import { db } from "../src/config/db.postgres.js";
import { businesses } from "../src/models/postgres/index.js";
import { eq, sql, desc } from "drizzle-orm";

runJob("list-external", async ({ args }) => {
  const limit = intArg(args[0], 15);

  const rows = await db
    .select()
    .from(businesses)
    .where(eq(businesses.isExternal, true))
    .orderBy(desc(businesses.createdAt))
    .limit(limit);

  console.log("\n=== External businesses ===");
  console.table(
    rows.map((r) => ({
      name: r.companyName,
      sector: r.sector,
      city: r.city,
      ask: r.fundingAsk,
      years: r.yearsOperating,
      enrichment: r.enrichmentStatus,
    }))
  );

  const sectorStats = await db.execute(sql`
    SELECT sector, COUNT(*)::int AS count
    FROM businesses
    WHERE is_external = true
    GROUP BY sector
    ORDER BY count DESC
    LIMIT 20
  `);

  console.log("\n=== Sector distribution ===");
  console.table(sectorStats.rows);

  return { shown: rows.length };
});