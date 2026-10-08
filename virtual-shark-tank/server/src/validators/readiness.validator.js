import { z } from "zod";

export const readinessTrendQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).optional().default(30),
});