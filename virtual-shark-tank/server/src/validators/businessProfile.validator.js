import { z } from "zod";

const websiteUrlField = z
  .string()
  .max(500)
  .transform((v) => {
    if (!v) return v;
    return v.startsWith("http://") || v.startsWith("https://")
      ? v
      : `https://${v}`;
  })
  .refine(
    (v) => !v || z.string().url().safeParse(v).success,
    { message: "Invalid URL" }
  )
  .optional()
  .nullable();

export const createBusinessSchema = z.object({
  companyName: z.string().min(2).max(255),
  sector: z.string().min(2).max(100).optional(),
  city: z.string().min(2).max(100).optional(),
  description: z.string().min(10).max(2000).optional(),
  fundingAsk: z.coerce.number().positive().optional(),
  yearsOperating: z.coerce.number().int().min(0).max(100).optional(),
  websiteUrl: websiteUrlField,
 udyamNumber: z.string().max(50).trim().optional().nullable(),
gstNumber: z.string().max(50).trim().optional().nullable(),
shopActLicense: z.string().max(50).trim().optional().nullable(),
});

// Fields a business user can update. Every field is optional (PATCH semantics).
export const updateBusinessProfileSchema = z
  .object({
    companyName: z.string().min(2).max(255).optional(),
    sector: z.string().min(2).max(100).optional(),
    city: z.string().min(2).max(100).optional(),
    description: z.string().min(10).max(2000).optional(),
    fundingAsk: z.coerce.number().positive().optional(),
    yearsOperating: z.coerce.number().int().min(0).max(100).optional(),
    websiteUrl: websiteUrlField,
    udyamNumber: z.string().max(50).optional().nullable(),
    gstNumber: z.string().max(50).optional().nullable(),
    shopActLicense: z.string().max(50).optional().nullable(),
  })
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