import { runJob } from "../src/cli/runJob.js";
import { db } from "../src/config/db.postgres.js";
import { sql } from "drizzle-orm";

runJob("backfill-website", async () => {
  const result = await db.execute(sql`
    UPDATE businesses b
    SET website_url = NULLIF(TRIM(r.raw_data->>'Company Website'), '')
    FROM raw_import_businesses r
    WHERE b.source_row_id = r.id
      AND b.is_external = true
      AND b.website_url IS NULL
  `);

  return { websitesBackfilled: result.rowCount ?? 0 };
});