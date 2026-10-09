import { runJob, requireArg } from "../src/cli/runJob.js";
import fs from "node:fs";
import { parse } from "csv-parse";
import { proposeMapping } from "../src/services/columnMatcher.service.js";
import { inferTransform } from "../src/services/transformInferrer.service.js";

const SAMPLE_SIZE = 20;

runJob("propose-crosswalk", async ({ args, flags }) => {
  const filePath = requireArg(
    args[0],
    "filePath",
    "node scripts/propose-crosswalk.js <file.csv>"
  );

  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const parser = fs.createReadStream(filePath).pipe(
    parse({ columns: true, skip_empty_lines: true, bom: true })
  );

  let headers = null;
  const sampleValues = {}; // { columnName: [values] }

  for await (const record of parser) {
    if (!headers) {
      headers = Object.keys(record);
      headers.forEach((h) => (sampleValues[h] = []));
    }
    for (const h of headers) {
      if (sampleValues[h].length < SAMPLE_SIZE) {
        sampleValues[h].push(record[h]);
      }
    }
    if (headers.every((h) => sampleValues[h].length >= SAMPLE_SIZE)) break;
  }

  if (!headers) throw new Error("Could not read CSV header");

  const proposal = proposeMapping(headers);

  // Infer transforms for mapped fields
  const enriched = proposal.mappings.map((m) => {
    if (!m.field) return m;
    const values = sampleValues[m.source] || [];
    const inferred = inferTransform(values, m.field, m.source);
    return { ...m, ...inferred };
  });

  console.log(`\nFile: ${filePath}`);
  console.log(`Columns: ${headers.length}`);
  console.log(`Mapped: ${proposal.mapped}  Unmapped: ${proposal.unmapped}\n`);

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

  console.log("\nSample values for mapped columns:");
  for (const m of enriched.filter((x) => x.field)) {
    const values = sampleValues[m.source] || [];
    const preview = values
      .slice(0, 3)
      .map((v) => JSON.stringify(v))
      .join(", ");
    console.log(`  ${m.source.padEnd(28)} [${m.transform.padEnd(20)}] ${preview}`);
  }

  // Count summary
  const transformCounts = enriched
    .filter((m) => m.field)
    .reduce((acc, m) => {
      acc[m.transform] = (acc[m.transform] || 0) + 1;
      return acc;
    }, {});

  console.log("\nTransform distribution:");
  Object.entries(transformCounts).forEach(([t, c]) =>
    console.log(`  ${t}: ${c}`)
  );

  return {
    file: filePath,
    mapped: proposal.mapped,
    unmapped: proposal.unmapped,
    transforms: transformCounts,
  };
});