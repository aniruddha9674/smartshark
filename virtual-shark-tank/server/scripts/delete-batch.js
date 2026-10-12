import { runJob } from "../src/cli/runJob.js";
import { db } from "../src/config/db.postgres.js";
import {
  businesses,
  importBatches,
  rawImportBusinesses,
  harmonizationErrors,
} from "../src/models/postgres/index.js";
import { eq, sql } from "drizzle-orm";

runJob("delete-batch", async ({ args }) => {
  const batchId = args[0];

  if (!batchId) {
    const batches = await db
      .select({
        id: importBatches.id,
        source: importBatches.sourceName,
        status: importBatches.status,
        rows: importBatches.totalRows,
      })
      .from(importBatches)
      .orderBy(sql`${importBatches.startedAt} DESC`)
      .limit(10);

    console.log("\nRecent batches:\n");
    console.table(batches);
    console.log("\nUsage: node scripts/delete-batch.js <batchId>\n");
    return { shown: batches.length };
  }

  const biz = await db
    .delete(businesses)
    .where(eq(businesses.sourceBatchId, batchId));
  const errs = await db
    .delete(harmonizationErrors)
    .where(eq(harmonizationErrors.batchId, batchId));
  const raw = await db
    .delete(rawImportBusinesses)
    .where(eq(rawImportBusinesses.batchId, batchId));
  const batch = await db
    .delete(importBatches)
    .where(eq(importBatches.id, batchId));

  return {
    batchId,
    deletedBusinesses: biz.rowCount ?? 0,
    deletedErrors: errs.rowCount ?? 0,
    deletedRawRows: raw.rowCount ?? 0,
    deletedBatch: batch.rowCount ?? 0,
  };
});