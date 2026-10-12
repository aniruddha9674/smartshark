import { runJob } from "../src/cli/runJob.js";
import { db } from "../src/config/db.postgres.js";
import { sql } from "drizzle-orm";

runJob("check-logos", async () => {
  const stats = await db.execute(sql`
    SELECT
      enrichment_status,
      COUNT(*)::int AS count,
      COUNT(logo_url)::int AS with_logo
    FROM businesses
    WHERE is_external = true
    GROUP BY enrichment_status
  `);
  console.table(stats.rows);

  const sample = await db.execute(sql`
    SELECT company_name, logo_url
    FROM businesses
    WHERE is_external = true
    LIMIT 5
  `);
  console.table(sample.rows);

  return { statuses: stats.rows.length };
});