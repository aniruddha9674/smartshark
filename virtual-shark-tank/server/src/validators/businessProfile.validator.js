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
    tagline: z.string().max(300).trim().optional(),
description: z.string().max(5000).trim().optional(),
business_model: z.string().max(100).trim().optional(),
target_market: z.string().max(200).trim().optional(),
differentiation: z.string().max(2000).trim().optional(),
key_products: z.array(z.string()).max(20).optional(),
notable_clients: z.array(z.string()).max(30).optional(),
competitors: z.array(z.string()).max(20).optional(),

funding_ask: z.coerce.number().positive().optional(),
funding_instrument: z.enum(["equity", "debt", "revenue_share", "hybrid"]).optional(),
use_of_funds: z.array(z.object({
  category: z.string().max(100),
  pct: z.coerce.number().min(0).max(100),
  description: z.string().max(300).optional(),
})).optional(),
planned_milestones: z.array(z.object({
  months: z.coerce.number().int().positive(),
  milestone: z.string().max(500),
})).optional(),

revenue_range: z.string().max(50).trim().optional(),
revenue_source: z.string().max(30).trim().optional(),
revenue_trend_bracket: z.enum(["declining", "flat", "growing_20", "growing_50", "growing_100"]).optional(),
customer_count: z.coerce.number().int().nonnegative().optional(),
repeat_customer_pct: z.coerce.number().min(0).max(100).optional(),
monthly_order_volume: z.coerce.number().int().nonnegative().optional(),

employee_count: z.coerce.number().int().nonnegative().optional(),
employee_count_source: z.string().max(30).optional(),

linkedin_url: z.string().url().max(500).optional().or(z.literal("")),
twitter_url: z.string().url().max(500).optional().or(z.literal("")),

self_declared_risks: z.string().max(2000).trim().optional(),
litigation_notes: z.string().max(2000).trim().optional(),
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