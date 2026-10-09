import fs from "node:fs";
import { parse } from "csv-parse";
import { eq, sql } from "drizzle-orm";
import { db } from "../config/db.postgres.js";
import {
  importBatches,
  rawImportBusinesses,
} from "../models/postgres/index.js";
import { ApiError } from "../utils/apiError.js";

const BATCH_SIZE = 500;

/**
 * Import a CSV file into raw_import_businesses.
 * Streams the file, batches inserts, tracks progress in import_batches.
 */
export const importCsv = async ({ filePath, sourceName }) => {
  if (!fs.existsSync(filePath)) {
    throw ApiError.badRequest(`File not found: ${filePath}`);
  }

  const stat = fs.statSync(filePath);

  const [batch] = await db
    .insert(importBatches)
    .values({
      sourceName,
      fileName: filePath.split(/[/\\]/).pop(),
      fileSizeBytes: stat.size,
      status: "importing",
    })
    .returning();

  let totalRows = 0;
  let failedRows = 0;
  const buffer = [];

  const flush = async () => {
    if (buffer.length === 0) return;
    try {
      await db.insert(rawImportBusinesses).values(buffer);
      totalRows += buffer.length;
    } catch (err) {
      failedRows += buffer.length;
      console.error(`[csvImport] batch insert failed: ${err.message}`);
    } finally {
      buffer.length = 0;
    }
  };

  const parser = fs
    .createReadStream(filePath)
    .pipe(
      parse({
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
        bom: true,
      })
    );

  let rowIndex = 0;
  try {
    for await (const record of parser) {
      buffer.push({
        batchId: batch.id,
        sourceRowIndex: rowIndex++,
        rawData: record,
      });

      if (buffer.length >= BATCH_SIZE) {
        await flush();
      }
    }
    await flush();

    const [updated] = await db
      .update(importBatches)
      .set({
        status: "importing_done",
        totalRows,
        failedRows,
        completedAt: new Date(),
      })
      .where(eq(importBatches.id, batch.id))
      .returning();

    return updated;
  } catch (err) {
    await db
      .update(importBatches)
      .set({
        status: "failed",
        totalRows,
        failedRows,
        completedAt: new Date(),
        errorMessage: err.message,
      })
      .where(eq(importBatches.id, batch.id));

    throw err;
  }
};

export const getBatchStats = async (batchId) => {
  const [batch] = await db
    .select()
    .from(importBatches)
    .where(eq(importBatches.id, batchId))
    .limit(1);

  if (!batch) throw ApiError.notFound("Batch not found");

  const [rawCount] = await db
    .select({ count: sql`count(*)`.mapWith(Number) })
    .from(rawImportBusinesses)
    .where(eq(rawImportBusinesses.batchId, batchId));

  return { ...batch, rawRowsInDb: rawCount.count };
};

export const listBatches = async () => {
  return db
    .select()
    .from(importBatches)
    .orderBy(sql`${importBatches.startedAt} DESC`);
};