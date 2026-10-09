import { runJob } from "../src/cli/runJob.js";
import { db } from "../src/config/db.postgres.js";
import { businesses } from "../src/models/postgres/index.js";
import { eq, sql } from "drizzle-orm";

runJob("show-enriched", async () => {
  const stats = await db.execute(sql`
    SELECT enrichment_status, COUNT(*)::int AS count
    FROM businesses
    WHERE is_external = true
    GROUP BY enrichment_status
    ORDER BY count DESC
  `);

  console.log("\n=== Enrichment status ===");
  console.table(stats.rows);

  const sample = await db
    .select({
      name: businesses.companyName,
      logo: businesses.logoUrl,
      cover: businesses.coverImageUrl,
    })
    .from(businesses)
    .where(eq(businesses.enrichmentStatus, "enriched"))
    .limit(5);

  console.log("\n=== Sample enriched businesses ===");
  console.table(sample);

  return { totalRows: stats.rows.reduce((s, r) => s + r.count, 0) };
});