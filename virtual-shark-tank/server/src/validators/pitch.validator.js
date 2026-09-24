import { z } from "zod";

// ---- Reusable pieces ----
const stageEnum = z.enum(["idea", "mvp", "early_revenue", "growth", "scale"]);

const revenueRangeEnum = z.enum([
  "pre_revenue",
  "under_10L",
  "10L_1Cr",
  "1Cr_10Cr",
  "10Cr_plus",
]);

const contentSchema = z
  .object({
    problem: z.string().max(5000).optional(),
    solution: z.string().max(5000).optional(),
    marketSize: z.string().max(5000).optional(),
    tractionNarrative: z.string().max(5000).optional(),
    teamNarrative: z.string().max(5000).optional(),
    competition: z.string().max(5000).optional(),
    businessModel: z.string().max(5000).optional(),
    useOfFunds: z.string().max(5000).optional(),
    milestones: z.string().max(5000).optional(),
  })
  .optional();

// ---- CREATE: full pitch creation ----
// Required to create: title, askAmount, equityOffered
// Everything else is optional and can be filled before publish
export const createPitchSchema = z.object({
   businessId: z.string().uuid(),
  title: z.string().min(2).max(255),
  tagline: z.string().max(300).optional(),
  shortPitch: z.string().max(500).optional(),
  longSummary: z.string().max(20000).optional(),

  askAmount: z.coerce.number().positive(),
  equityOffered: z.coerce.number().positive().max(100),

  stage: stageEnum.optional(),
  revenueRange: revenueRangeEnum.optional(),
  monthlyGrowthPct: z.coerce.number().min(-100).max(1000).optional(),
  teamSize: z.coerce.number().int().positive().optional(),
  foundedYear: z.coerce.number().int().min(1900).max(2100).optional(),

  content: contentSchema,

  videoUrl: z.string().url().max(500).optional().nullable(),
  pitchDeckUrl: z.string().url().max(500).optional().nullable(),
  coverImageUrl: z.string().url().max(500).optional().nullable(),

  sectorSpecificFields: z.record(z.any()).optional(),
});

// ---- UPDATE: all fields optional, no empty body ----
export const updatePitchSchema = z
  .object({
    title: z.string().min(2).max(255).optional(),
    tagline: z.string().max(300).optional().nullable(),
    shortPitch: z.string().max(500).optional().nullable(),
    longSummary: z.string().max(20000).optional().nullable(),

    askAmount: z.coerce.number().positive().optional(),
    equityOffered: z.coerce.number().positive().max(100).optional(),

    stage: stageEnum.optional().nullable(),
    revenueRange: revenueRangeEnum.optional().nullable(),
    monthlyGrowthPct: z.coerce.number().min(-100).max(1000).optional().nullable(),
    teamSize: z.coerce.number().int().positive().optional().nullable(),
    foundedYear: z.coerce.number().int().min(1900).max(2100).optional().nullable(),

    content: contentSchema,

    videoUrl: z.string().url().max(500).optional().nullable(),
    pitchDeckUrl: z.string().url().max(500).optional().nullable(),
    coverImageUrl: z.string().url().max(500).optional().nullable(),

    sectorSpecificFields: z.record(z.any()).optional().nullable(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

// ---- PUBLISH: what's required to go live ----
// These fields must be present on the pitch before it can go live.
// Validated in the service against the actual DB row, not the request body.
export const REQUIRED_TO_PUBLISH = [
  "title",
  "tagline",
  "shortPitch",
  "longSummary",
  "askAmount",
  "equityOffered",
  "stage",
  "revenueRange",
];

// ---- PUBLISH body: no fields needed, but body can't be undefined ----
export const publishPitchSchema = z.object({}).passthrough();