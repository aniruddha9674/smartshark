import { z } from "zod";

export const createVerificationSchema = z.object({
  businessId: z.string().uuid(),
  documentType: z.enum(["udyam", "gst", "shop_act"]),
  documentUrl: z.string().url(),
  publicId: z.string().optional(),
});

export const listVerificationsQuerySchema = z.object({
  businessId: z.string().uuid().optional(),
});

export const applyVerificationSchema = z.object({
  confirmedFields: z
    .record(
      z.string(),
      z.union([z.string(), z.number(), z.null()])
    )
    .optional()
    .default({}),
});