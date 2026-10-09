import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { eq } from "drizzle-orm";
import { db } from "../../src/config/db.postgres.js";
import {
  importBatches,
  rawImportBusinesses,
} from "../../src/models/postgres/index.js";
import { importCsv, getBatchStats } from "../../src/services/csvImport.service.js";

const writeTempCsv = (content) => {
  const file = path.join(os.tmpdir(), `test-${Date.now()}-${Math.random()}.csv`);
  fs.writeFileSync(file, content);
  return file;
};

describe("csvImport.service", () => {
  const tempFiles = [];

  beforeEach(async () => {
    await db.delete(rawImportBusinesses);
    await db.delete(importBatches);
  });

  afterEach(() => {
    for (const f of tempFiles) {
      if (fs.existsSync(f)) fs.unlinkSync(f);
    }
    tempFiles.length = 0;
  });

  it("imports a valid CSV into raw_import_businesses", async () => {
    const csv = `Startup Name,Industry,City
Acme SaaS,SaaS,Bangalore
Beta Fintech,Fintech,Mumbai`;
    const file = writeTempCsv(csv);
    tempFiles.push(file);

    const batch = await importCsv({ filePath: file, sourceName: "test_csv" });

    expect(batch.status).toBe("importing_done");
    expect(batch.totalRows).toBe(2);
    expect(batch.failedRows).toBe(0);

    const rows = await db.select().from(rawImportBusinesses);
    expect(rows).toHaveLength(2);
    expect(rows[0].rawData["Startup Name"]).toBe("Acme SaaS");
    expect(rows[0].rawData.Industry).toBe("SaaS");
  });

  it("preserves all original columns as jsonb", async () => {
    const csv = `Name,Sector,Funding,Notes
Acme,SaaS,5000000,"Multi-line\\nnote"`;
    const file = writeTempCsv(csv);
    tempFiles.push(file);

    await importCsv({ filePath: file, sourceName: "test_preserve" });

    const [row] = await db.select().from(rawImportBusinesses);
    expect(row.rawData.Name).toBe("Acme");
    expect(row.rawData.Sector).toBe("SaaS");
    expect(row.rawData.Funding).toBe("5000000");
    expect(row.rawData.Notes).toContain("Multi-line");
  });

  it("batches inserts correctly for >500 rows", async () => {
    const header = "Name,Sector\n";
    const rows = Array.from({ length: 1200 }, (_, i) => `Co${i},SaaS`).join("\n");
    const file = writeTempCsv(header + rows);
    tempFiles.push(file);

    const batch = await importCsv({ filePath: file, sourceName: "test_batch" });

    expect(batch.totalRows).toBe(1200);
    const count = await db.select().from(rawImportBusinesses);
    expect(count).toHaveLength(1200);
  });

  it("throws for nonexistent file", async () => {
    await expect(
      importCsv({ filePath: "/does/not/exist.csv", sourceName: "test_missing" })
    ).rejects.toThrow(/File not found/);
  });

  it("tracks row indexes sequentially", async () => {
    const csv = `A,B\nx,1\ny,2\nz,3`;
    const file = writeTempCsv(csv);
    tempFiles.push(file);

    await importCsv({ filePath: file, sourceName: "test_index" });

    const rows = await db
      .select()
      .from(rawImportBusinesses)
      .orderBy(rawImportBusinesses.sourceRowIndex);
    expect(rows.map((r) => r.sourceRowIndex)).toEqual([0, 1, 2]);
  });

  it("getBatchStats returns batch + row count", async () => {
    const csv = `A,B\nx,1\ny,2`;
    const file = writeTempCsv(csv);
    tempFiles.push(file);

    const batch = await importCsv({ filePath: file, sourceName: "test_stats" });
    const stats = await getBatchStats(batch.id);

    expect(stats.totalRows).toBe(2);
    expect(stats.rawRowsInDb).toBe(2);
    expect(stats.sourceName).toBe("test_stats");
  });
});