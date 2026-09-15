import { z } from "zod";

// Fields an investor can update. Every field is optional (PATCH semantics).
export const updateInvestorProfileSchema = z
  .object({
    firmName: z.string().min(2).max(255).optional(),
    investmentFocus: z.string().min(2).max(255).optional(),
    preferredGeography: z.string().min(2).max(255).optional(),
    minTicketSize: z.coerce.number().positive().optional(),
    maxTicketSize: z.coerce.number().positive().optional(),
    panNumber: z.string().max(20).optional().nullable(),
  })
  // Empty PATCH body is meaningless
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  })
  // If both are provided together, min must be ≤ max
  .refine(
    (data) => {
      if (data.minTicketSize == null || data.maxTicketSize == null) return true;
      return data.minTicketSize <= data.maxTicketSize;
    },
    {
      message: "minTicketSize must be less than or equal to maxTicketSize",
      path: ["minTicketSize"],
    }
  );

// Required fields for a profile to be marked "complete"
export const REQUIRED_INVESTOR_FIELDS = [
  "firmName",
  "investmentFocus",
  "preferredGeography",
  "minTicketSize",
  "maxTicketSize",
];