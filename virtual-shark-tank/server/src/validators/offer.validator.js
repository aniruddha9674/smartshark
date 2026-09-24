import { z } from "zod";

// ---- Create an offer (investor → pitch) ----
export const createOfferSchema = z.object({
  pitchId: z.string().uuid(),
  amount: z.coerce.number().positive(),
  equityRequested: z.coerce.number().positive().max(100),
  conditions: z.record(z.any()).optional(),
  message: z.string().max(2000).optional(),
  // Days until expiry — defaults to 7 if omitted, capped at 30
  expiresInDays: z.coerce.number().int().min(1).max(30).optional(),
});

// ---- Counter an offer (either party) ----
// Same terms as create, minus pitchId (inherited from parent offer)
export const counterOfferSchema = z.object({
  amount: z.coerce.number().positive(),
  equityRequested: z.coerce.number().positive().max(100),
  conditions: z.record(z.any()).optional(),
  message: z.string().max(2000).optional(),
  expiresInDays: z.coerce.number().int().min(1).max(30).optional(),
});

// ---- Constants ----
export const OFFER_DEFAULT_EXPIRY_DAYS = 7;
export const OFFER_MAX_COUNTER_DEPTH = 10;
export const MAX_OFFERS_PER_DAY = 20;