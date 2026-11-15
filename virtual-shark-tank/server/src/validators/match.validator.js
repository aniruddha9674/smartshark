import { z } from "zod";

export const feedQuerySchema = z.object({
  minScore: z.coerce.number().int().min(0).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0),
  sector: z.string().max(255).optional(),
  minAsk: z.coerce.number().nonnegative().optional(),
  maxAsk: z.coerce.number().nonnegative().optional(),
  verifiedOnly: z
    .union([z.boolean(), z.enum(["true", "false", "1", "0"])])
    .optional()
    .transform((v) => v === true || v === "true" || v === "1"),
  minReadiness: z.coerce.number().int().min(0).max(100).optional(),
  sortBy: z.enum(["relevance", "readiness", "newest"]).optional(),
});
