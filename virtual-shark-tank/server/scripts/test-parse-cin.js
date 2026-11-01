import fs from "node:fs";
import { parse } from "csv-parse/sync";
import { parseCIN } from "../src/utils/identifiers.js";

const file = process.argv[2];
if (!file) {
  console.error("Usage: node scripts/test-parse-cin.js <csv>");
  process.exit(1);
}

const csv = fs.readFileSync(file, "utf8");
const rows = parse(csv, { columns: true, skip_empty_lines: true, relax_column_count: true });

console.log(`Total rows: ${rows.length}`);

console.log(`\nFirst 3 rows (raw):`);
for (const row of rows.slice(0, 3)) {
  console.log(JSON.stringify(row, null, 2).slice(0, 500));
}

console.log(`\nFirst 5 CINs parsed:`);
for (const row of rows.slice(0, 5)) {
  console.log(row.CIN, "→", parseCIN(row.CIN));
}

console.log(`\nValidity across first 1,000 rows:`);
let valid = 0, invalid = 0;
const reasons = {};
for (const row of rows.slice(0, 1000)) {
  const r = parseCIN(row.CIN);
  if (r.valid) valid++;
  else {
    invalid++;
    reasons[r.error] = (reasons[r.error] || 0) + 1;
  }
}
console.log(`Valid: ${valid}, Invalid: ${invalid}`);
console.log("Failure reasons:", reasons);