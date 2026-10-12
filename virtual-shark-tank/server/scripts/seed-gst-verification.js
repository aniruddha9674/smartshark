import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import { db, pool } from "../src/config/db.postgres.js";
import { businesses } from "../src/models/postgres/index.js";
import { Verification } from "../src/models/mongo/verification.model.js";
import { eq, desc } from "drizzle-orm";

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Mongo connected");

  // Find the most recently created business (your Incorbiss / WINNFRA one)
  const [business] = await db
    .select()
    .from(businesses)
    .orderBy(desc(businesses.createdAt))
    .limit(1);

  if (!business) {
    console.error("No business found. Create one first.");
    process.exit(1);
  }

  console.log(`Business: ${business.companyName} (${business.id})`);
  console.log(`Owner: ${business.ownerId}`);
  console.log(`Current tier: ${business.verificationTier}`);

  // Check for an existing verified GST to avoid duplicates
  const existing = await Verification.findOne({
    businessId: business.id,
    documentType: "gst",
    status: "verified",
  });

  if (existing) {
    console.log("\nVerified GST already exists:", existing._id);
    console.log("Delete it first if you want to re-seed.");
    await mongoose.disconnect();
    await pool.end();
    process.exit(0);
  }

  // Insert a fake verified GST record with the SAME company name as the Udyam
  const gst = await Verification.create({
    userId: business.ownerId,
    businessId: business.id,
    documentType: "gst",
    documentUrl: "https://res.cloudinary.com/diohvxzaq/image/upload/sample-gst.png",
    publicId: "seed/sample-gst",
    status: "verified",
    confidenceScore: 0.94,
    formatValid: true,
    ocrExtractedData: {
      legal_name: {
        value: "WINNFRA GLOBAL PRIVATE LIMITED",
        confidence: 0.96,
        formatValid: null,
        formatReason: null,
      },
      trade_name: {
        value: "Winnfra",
        confidence: 0.92,
        formatValid: null,
        formatReason: null,
      },
      gstin: {
        value: "27AAPFU0939F1ZV",
        confidence: 0.97,
        formatValid: true,
        formatReason: null,
      },
      principal_place_of_business: {
        value:
          "OFFICE NO. B9, B-10, SEC - 2, NOIDA, GAUTAM BUDDHA NAGAR, UTTAR PRADESH, 201301",
        confidence: 0.90,
        formatValid: null,
        formatReason: null,
      },
      date_of_liability: {
        value: "2025-09-20",
        confidence: 0.94,
        formatValid: null,
        formatReason: null,
      },
      constitution_of_business: {
        value: "Private Limited",
        confidence: 0.93,
        formatValid: null,
        formatReason: null,
      },
    },
  });

  console.log("\nGST verification created:");
  console.log("  ID:", gst._id.toString());
  console.log("  Status:", gst.status);
  console.log("  Confidence:", gst.confidenceScore);
  console.log("  Company name:", gst.ocrExtractedData.get("legal_name")?.value);

  await mongoose.disconnect();
  await pool.end();
};

run().catch((err) => {
  console.error("Failed:", err.message);
  process.exit(1);
});