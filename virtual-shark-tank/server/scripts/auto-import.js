import { runJob, requireArg, intArg } from "../src/cli/runJob.js";
import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse";
import { proposeMapping } from "../src/services/columnMatcher.service.js";
import { inferTransform } from "../src/services/transformInferrer.service.js";
import {
  buildCrosswalk,
  validateCrosswalk,
} from "../src/services/crosswalkBuilder.service.js";
import { importCsv, getBatchStats } from "../src/services/csvImport.service.js";
import { harmonizeBatch } from "../src/services/harmonization.service.js";
import { createPrompt, promptChoice } from "../src/cli/prompts.js";

const SAMPLE_SIZE = 20;
const CROSSWALK_DIR = path.resolve("config/crosswalks");

const readCsv = (filePath, sampleSize = SAMPLE_SIZE) => {
  return new Promise((resolve, reject) => {
    const parser = fs
      .createReadStream(filePath)
      .pipe(parse({ columns: true, skip_empty_lines: true, bom: true }));

    let headers = null;
    const sampleValues = {};
    let rowCount = 0;

    parser.on("data", (record) => {
      if (!headers) {
        headers = Object.keys(record);
        headers.forEach((h) => (sampleValues[h] = []));
      }
      rowCount++;
      for (const h of headers) {
        if (sampleValues[h].length < sampleSize) {
          sampleValues[h].push(record[h]);
        }
      }
    });

    parser.on("end", () => {
      if (!headers) return reject(new Error("Could not read CSV header"));
      resolve({ headers, sampleValues, rowCount });
    });

    parser.on("error", reject);
  });
};

runJob("auto-import", async ({ args, flags }) => {
  const filePath = requireArg(
    args[0],
    "filePath",
    "node scripts/auto-import.js <file.csv> <source> [--auto-approve]"
  );
  const source = requireArg(
    args[1],
    "source",
    "node scripts/auto-import.js <file.csv> <source> [--auto-approve]"
  );

  if (!fs.existsSync(filePath)) throw new Error(`File not found: ${filePath}`);

  const autoApprove = flags.has("--auto-approve");
  const proposeOnly = flags.has("--propose-only");
  const skipImport = flags.has("--skip-import");

  console.log(`\nReading ${filePath}...`);
  const { headers, sampleValues, rowCount } = await readCsv(filePath);
  console.log(`  ${headers.length} columns, ${rowCount} rows\n`);

  // Stage 1: propose mapping
  const proposal = proposeMapping(headers);

  // Stage 2: infer transforms
  const enriched = proposal.mappings.map((m) => {
    if (!m.field) return m;
    const inferred = inferTransform(sampleValues[m.source] || [], m.field, m.source);
    return { ...m, ...inferred };
  });

  // Show proposal
  console.log("Proposed mappings:");
  console.table(
    enriched
      .filter((m) => m.field)
      .map((m) => ({
        source: m.source.substring(0, 28),
        field: m.field,
        transform: m.transform,
        confidence: m.confidence,
      }))
  );

  const unmappedCount = enriched.filter((m) => !m.field).length;
  console.log(`  ${unmappedCount} columns not mapped\n`);

  // Stage 3: build crosswalk
  const crosswalk = buildCrosswalk(source, enriched, {
    description: `Auto-generated crosswalk for ${source}`,
  });

  const validation = validateCrosswalk(crosswalk);
  if (!validation.valid) {
    console.error("Crosswalk validation failed:");
    validation.errors.forEach((e) => console.error(`  - ${e}`));
    throw new Error("Cannot proceed with invalid crosswalk");
  }

  if (proposeOnly) {
    const proposalPath = path.join(CROSSWALK_DIR, `${source}.proposed.json`);
    fs.mkdirSync(CROSSWALK_DIR, { recursive: true });
    fs.writeFileSync(proposalPath, JSON.stringify(crosswalk, null, 2));
    console.log(`Proposal written to ${proposalPath}`);
    console.log(`Review it, then move to config/crosswalks/${source}.json\n`);
    return { proposed: proposalPath };
  }

  // Stage 4: review
  let approved = autoApprove;
  if (!autoApprove) {
    const rl = createPrompt();
    try {
      const choice = await promptChoice(rl, "Approve this crosswalk?", [
        "a",
        "q",
      ]);
      approved = choice === "a";
    } finally {
      rl.close();
    }
  }

  if (!approved) {
    console.log("Aborted. No changes written.");
    return { approved: false };
  }

  // Stage 5: save crosswalk
  fs.mkdirSync(CROSSWALK_DIR, { recursive: true });
  const crosswalkPath = path.join(CROSSWALK_DIR, `${source}.json`);
  fs.writeFileSync(crosswalkPath, JSON.stringify(crosswalk, null, 2));
  console.log(`\nCrosswalk saved: ${crosswalkPath}`);

  if (skipImport) {
    console.log("Skipping import (--skip-import)");
    return { crosswalkPath, skipped: true };
  }

  // Stage 6: import + harmonize
  console.log(`\nImporting ${filePath}...`);
  const batch = await importCsv({ filePath, sourceName: source });
  console.log(`  Batch: ${batch.id}`);
  console.log(`  Rows: ${batch.totalRows}`);

  console.log(`\nHarmonizing...`);
  const result = await harmonizeBatch(batch.id);
  console.log(`  Inserted: ${result.stats.inserted}`);
  console.log(`  Skipped: ${result.stats.skipped}`);
  console.log(`  Errored: ${result.stats.errored}`);

  return {
    crosswalkPath,
    batchId: batch.id,
    imported: batch.totalRows,
    inserted: result.stats.inserted,
    skipped: result.stats.skipped,
    errored: result.stats.errored,
  };
});