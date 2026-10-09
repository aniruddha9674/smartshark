import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { eq } from "drizzle-orm";
import { db } from "../../src/config/db.postgres.js";
import {
  users,
  businesses,
  importBatches,
  rawImportBusinesses,
  harmonizationErrors,
} from "../../src/models/postgres/index.js";
import { importCsv } from "../../src/services/csvImport.service.js";
import { harmonizeBatch } from "../../src/services/harmonization.service.js";

const CROSSWALK_PATH = path.resolve("config/crosswalks/test_fixture.json");

const writeTempCsv = (content) => {
  const file = path.join(os.tmpdir(), `harm-${Date.now()}-${Math.random()}.csv`);
  fs.writeFileSync(file, content);
  return file;
};

const writeTestCrosswalk = () => {
  const cw = {
    source: "test_fixture",
    target: "businesses",
    version: 1,
    fieldMappings: {
      Name: { field: "companyName", transform: "trim" },
      Industry: { field: "sector", transform: "normalizeSector" },
      City: { field: "city", transform: "normalizeCity" },
      Ask: { field: "fundingAsk", transform: "toINR" },
      Founded: { field: "yearsOperating", transform: "toYear" },
    },
    validators: {
      companyName: { required: true, minLength: 2, maxLength: 255 },
      fundingAsk: { required: false, type: "number", min: 0 },
    },
    defaults: {
      verificationTier: "unverified",
      isProfileComplete: false,
      isExternal: true,
    },
    dedupeKey: "companyName",
  };
  fs.writeFileSync(CROSSWALK_PATH, JSON.stringify(cw, null, 2));
};

describe("harmonization.service", () => {
  const tempFiles = [];

  beforeEach(async () => {
    await db.delete(harmonizationErrors);
    await db.delete(businesses);
    await db.delete(rawImportBusinesses);
    await db.delete(importBatches);
    await db.delete(users);
    fs.mkdirSync(path.dirname(CROSSWALK_PATH), { recursive: true });
    writeTestCrosswalk();
  });

  afterEach(() => {
    for (const f of tempFiles) {
      if (fs.existsSync(f)) fs.unlinkSync(f);
    }
    tempFiles.length = 0;
    if (fs.existsSync(CROSSWALK_PATH)) fs.unlinkSync(CROSSWALK_PATH);
  });

  it("harmonizes a clean batch into businesses", async () => {
    const csv = `Name,Industry,City,Ask,Founded
Acme SaaS,SaaS,Bangalore,"50 Lakhs",2021
Beta Fintech,Fintech,Mumbai,"2 Cr",2019`;
    const file = writeTempCsv(csv);
    tempFiles.push(file);

    const batch = await importCsv({ filePath: file, sourceName: "test_fixture" });
    const result = await harmonizeBatch(batch.id);

    expect(result.stats.inserted).toBe(2);
    expect(result.stats.errored).toBe(0);
    expect(result.stats.remaining).toBe(0);
    expect(result.batch.status).toBe("done");

    const rows = await db.select().from(businesses).orderBy(businesses.companyName);
    expect(rows).toHaveLength(2);
    expect(rows[0].companyName).toBe("Acme SaaS");
    expect(rows[0].sector).toBe("saas");
    expect(rows[0].city).toBe("bengaluru");
    expect(Number(rows[0].fundingAsk)).toBe(5000000);
    expect(rows[0].yearsOperating).toBe(2021);
    expect(rows[0].isExternal).toBe(true);
  });

  it("rejects rows with missing required fields", async () => {
    const csv = `Name,Industry,City
Acme SaaS,SaaS,Bangalore
,Fintech,Mumbai
Third Co,SaaS,Pune`;
    const file = writeTempCsv(csv);
    tempFiles.push(file);

    const batch = await importCsv({ filePath: file, sourceName: "test_fixture" });
    const result = await harmonizeBatch(batch.id);

    expect(result.stats.inserted).toBe(2);
    expect(result.stats.errored).toBe(1);

    const errors = await db.select().from(harmonizationErrors);
    expect(errors).toHaveLength(1);
    expect(errors[0].errorType).toBe("missing_required");
    expect(errors[0].fieldName).toBe("companyName");
  });

  it("deduplicates rows by dedupeKey", async () => {
    const csv = `Name,Industry
Acme SaaS,SaaS
ACME SAAS,Fintech
Beta Co,SaaS`;
    const file = writeTempCsv(csv);
    tempFiles.push(file);

    const batch = await importCsv({ filePath: file, sourceName: "test_fixture" });
    const result = await harmonizeBatch(batch.id);

    expect(result.stats.inserted).toBe(2);
    expect(result.stats.skipped).toBe(1);

    const dupErrors = await db
      .select()
      .from(harmonizationErrors)
      .where(eq(harmonizationErrors.errorType, "duplicate"));
    expect(dupErrors).toHaveLength(1);
  });

  it("assigns ownerId to the system user", async () => {
    const csv = `Name,Industry\nAcme,SaaS`;
    const file = writeTempCsv(csv);
    tempFiles.push(file);

    const batch = await importCsv({ filePath: file, sourceName: "test_fixture" });
    await harmonizeBatch(batch.id);

    const [biz] = await db.select().from(businesses);
    const [sysUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, "system@smartshark.internal"));

    expect(sysUser).toBeDefined();
    expect(biz.ownerId).toBe(sysUser.id);
  });

  it("records raw lineage (batchId + rowId)", async () => {
    const csv = `Name,Industry\nAcme,SaaS`;
    const file = writeTempCsv(csv);
    tempFiles.push(file);

    const batch = await importCsv({ filePath: file, sourceName: "test_fixture" });
    await harmonizeBatch(batch.id);

    const [biz] = await db.select().from(businesses);
    expect(biz.sourceBatchId).toBe(batch.id);
    expect(biz.sourceRowId).toBeTruthy();
  });

  it("handles malformed numeric values via transform fallback", async () => {
    const csv = `Name,Ask\nAcme,not_a_number`;
    const file = writeTempCsv(csv);
    tempFiles.push(file);

    const batch = await importCsv({ filePath: file, sourceName: "test_fixture" });
    const result = await harmonizeBatch(batch.id);

    // Row inserts; fundingAsk is undefined, so it stays null in DB
    expect(result.stats.inserted).toBe(1);
    const [biz] = await db.select().from(businesses);
    expect(biz.fundingAsk).toBeNull();
  });

  it("marks batch as done when all rows processed", async () => {
    const csv = `Name,Industry\nA Co,SaaS\nB Co,Fintech`;
    const file = writeTempCsv(csv);
    tempFiles.push(file);

    const batch = await importCsv({ filePath: file, sourceName: "test_fixture" });
    const result = await harmonizeBatch(batch.id);

    expect(result.batch.status).toBe("done");
    expect(result.batch.completedAt).toBeTruthy();
  });

  it("throws when crosswalk does not exist", async () => {
    const csv = `Name,Industry\nAcme,SaaS`;
    const file = writeTempCsv(csv);
    tempFiles.push(file);

    const batch = await importCsv({
      filePath: file,
      sourceName: "does_not_exist",
    });

    await expect(harmonizeBatch(batch.id)).rejects.toThrow(/No crosswalk found/);
  });
});