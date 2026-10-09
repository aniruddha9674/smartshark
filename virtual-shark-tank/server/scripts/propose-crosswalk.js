import { runJob, requireArg } from "../src/cli/runJob.js";
import fs from "node:fs";
import { parse } from "csv-parse";
import { proposeFullMapping } from "../src/services/autoMapping.service.js";

const SAMPLE_SIZE = 20;

runJob("propose-crosswalk", async ({ args, flags }) => {
  const filePath = requireArg(
    args[0],
    "filePath",
    "node scripts/propose-crosswalk.js <file.csv> [--no-llm]"
  );

  if (!fs.existsSync(filePath)) throw new Error(`File not found: ${filePath}`);

  const useLLM = !flags.has("--no-llm");

  const parser = fs.createReadStream(filePath).pipe(
    parse({ columns: true, skip_empty_lines: true, bom: true })
  );

  let headers = null;
  const sampleValues = {};

  for await (const record of parser) {
    if (!headers) {
      headers = Object.keys(record);
      headers.forEach((h) => (sampleValues[h] = []));
    }
    for (const h of headers) {
      if (sampleValues[h].length < SAMPLE_SIZE) sampleValues[h].push(record[h]);
    }
    if (headers.every((h) => sampleValues[h].length >= SAMPLE_SIZE)) break;
  }

  if (!headers) throw new Error("Could not read CSV header");

  const proposal = await proposeFullMapping(headers, sampleValues, { useLLM });

  console.log(`\nFile: ${filePath}`);
  console.log(`Columns: ${headers.length}`);
  console.log(`Mapped: ${proposal.mapped}  Unmapped: ${proposal.unmapped}`);
  if (proposal.llmUsed) {
    console.log(`LLM: ${proposal.llmMatched}/${proposal.llmProcessed} new fields mapped`);
  }
  console.log();

  console.table(
    proposal.mappings
      .filter((m) => m.field)
      .map((m) => ({
        source: m.source.substring(0, 28),
        field: m.field,
        transform: m.transform,
        confidence: m.confidence,
        origin: m.source_type,
      }))
  );

  return {
    file: filePath,
    mapped: proposal.mapped,
    unmapped: proposal.unmapped,
    llmMatched: proposal.llmMatched,
  };
});