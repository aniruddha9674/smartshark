import mongoose from "mongoose";

const extractedFieldSchema = new mongoose.Schema(
  {
    value: { type: mongoose.Schema.Types.Mixed, default: null },
    confidence: { type: Number, min: 0, max: 1, default: 0 },
  },
  { _id: false }
);

const verificationSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    businessId: { type: String, required: true, index: true },

    documentType: {
      type: String,
      required: true,
      enum: ["udyam", "gst", "shop_act"],
    },

    documentUrl: { type: String, required: true },
    publicId: { type: String, default: null },

    ocrExtractedData: {
      type: Map,
      of: extractedFieldSchema,
      default: {},
    },

    confidenceScore: { type: Number, min: 0, max: 1, default: 0 },

    status: {
      type: String,
      enum: ["pending", "verified", "needs_review", "rejected"],
      default: "pending",
      index: true,
    },

    appliedFields: { type: [String], default: [] },
    reviewedAt: { type: Date, default: null },
    errorMessage: { type: String, default: null },
  },
  { timestamps: true }
);

verificationSchema.index({ businessId: 1, documentType: 1 });
verificationSchema.index({ userId: 1, createdAt: -1 });

export const Verification = mongoose.model("Verification", verificationSchema);