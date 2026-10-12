import { runJob } from "../src/cli/runJob.js";
import { db } from "../src/config/db.postgres.js";
import { businesses } from "../src/models/postgres/index.js";
import { eq } from "drizzle-orm";

runJob("reset-enrichment", async () => {
  const result = await db
    .update(businesses)
    .set({
      enrichmentStatus: "pending",
      logoUrl: null,
      coverImageUrl: null,
      enrichedAt: null,
    })
    .where(eq(businesses.isExternal, true))
    .returning({ id: businesses.id });

  return { reset: result.length };
});