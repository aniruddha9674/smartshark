import { runJob } from "../src/cli/runJob.js";
import { db } from "../src/config/db.postgres.js";
import { businesses } from "../src/models/postgres/index.js";
import { eq } from "drizzle-orm";

runJob("mark-external-complete", async () => {
  const result = await db
    .update(businesses)
    .set({ isProfileComplete: true })
    .where(eq(businesses.isExternal, true))
    .returning({ id: businesses.id });

  return { marked: result.length };
});