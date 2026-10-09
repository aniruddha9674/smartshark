import { runJob, intArg } from "../src/cli/runJob.js";
import { enrichPending } from "../src/services/enrichment.service.js";

runJob("enrich", async ({ args, flags }) => {
  const limit = intArg(args[0], 50);
  const skipCover = !flags.has("--with-cover");
  return enrichPending({ limit, skipCover });
});