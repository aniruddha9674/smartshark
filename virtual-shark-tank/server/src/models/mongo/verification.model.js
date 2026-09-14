import mongoose from "mongoose";

const verificationSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  documentType: { type: String, enum: ["udyam", "gst", "shop_act"], required: true },
  documentUrl: { type: String, required: true },
  ocrExtractedData: { type: mongoose.Schema.Types.Mixed },
  status: {
    type: String,
    enum: ["pending", "verified", "needs_review", "rejected"],
    default: "pending",
  },
  confidenceScore: { type: Number },
  reviewedAt: { type: Date },
  createdAt: { type: Date, default: Date.now },
});

export const Verification = mongoose.model("Verification", verificationSchema);