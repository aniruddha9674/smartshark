import { runJob, requireArg } from "../src/cli/runJob.js";
import { importCsv, getBatchStats } from "../src/services/csvImport.service.js";

runJob("import-csv", async ({ args }) => {
  const filePath = requireArg(
    args[0],
    "filePath",
    "node scripts/import-csv.js <file.csv> <source-name>"
  );
  const sourceName = requireArg(
    args[1],
    "sourceName",
    "node scripts/import-csv.js <file.csv> <source-name>"
  );

  const batch = await importCsv({ filePath, sourceName });
  return getBatchStats(batch.id);
});