import { z } from "zod";

// Fields a business user can update. Every field is optional (PATCH semantics).
export const updateBusinessProfileSchema = z.object({
  companyName: z.string().min(2).max(255).optional(),
  sector: z.string().min(2).max(100).optional(),
  city: z.string().min(2).max(100).optional(),
  description: z.string().min(10).max(2000).optional(),
  fundingAsk: z.coerce.number().positive().optional(),
  yearsOperating: z.coerce.number().int().min(0).max(100).optional(),

  // Optional verification numbers — user fills these in but verification
  // happens via MongoDB flow later
  udyamNumber: z.string().max(50).optional().nullable(),
  gstNumber: z.string().max(50).optional().nullable(),
  shopActLicense: z.string().max(50).optional().nullable(),
})
  // Empty PATCH body is meaningless — reject it
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

// Required fields for a profile to be marked "complete"
export const REQUIRED_PROFILE_FIELDS = [
  "companyName",
  "sector",
  "city",
  "description",
  "fundingAsk",
  "yearsOperating",
];