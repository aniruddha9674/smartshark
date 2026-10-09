import { runJob } from "../src/cli/runJob.js";
import {
  harmonizeBatch,
  listHarmonizationErrors,
} from "../src/services/harmonization.service.js";
import { listBatches } from "../src/services/csvImport.service.js";

runJob("harmonize", async ({ args }) => {
  let batchId = args[0];

  if (!batchId) {
    const batches = await listBatches();
    const last = batches.find((b) => b.status === "importing_done");
    if (!last) {
      throw new Error("No batch in 'importing_done' state. Run import-csv first.");
    }
    batchId = last.id;
  }

  const result = await harmonizeBatch(batchId);

  if (result.stats.errored > 0) {
    const errors = await listHarmonizationErrors(batchId, { limit: 5 });
    return { ...result.stats, batchId, sampleErrors: errors };
  }

  return { ...result.stats, batchId };
});