import fs from "node:fs";
import { parse } from "csv-parse/sync";
import { parseCIN } from "../src/utils/identifiers.js";

const filePath = process.argv[2];
const rows = parse(fs.readFileSync(filePath, "utf8"), {
  columns: true, skip_empty_lines: true, relax_column_count: true,
});

const byLength = {};
const samples = {};
for (const row of rows) {
  const c = String(row.CIN || "").trim();
  if (!c) continue;
  if (parseCIN(c).valid) continue;
  byLength[c.length] = (byLength[c.length] || 0) + 1;
  if (!samples[c.length]) samples[c.length] = { cin: c, name: row.CompanyName };
}

console.log("Skipped by length:");
console.table(byLength);
console.log("\nSamples:");
for (const [len, s] of Object.entries(samples)) {
  console.log(`  len ${len}: ${s.cin}  (${s.name})`);
}