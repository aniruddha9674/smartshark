import { Router } from "express";
import mongoose from "mongoose";
import { sql } from "drizzle-orm";
import { db } from "../config/db.postgres.js";

const router = Router();

router.get("/", async (req, res) => {
  const checks = { postgres: "unknown", mongo: "unknown" };

  try {
    await db.execute(sql`SELECT 1`);
    checks.postgres = "ok";
  } catch {
    checks.postgres = "fail";
  }

  try {
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.db.admin().ping();
      checks.mongo = "ok";
    } else {
      checks.mongo = "fail";
    }
  } catch {
    checks.mongo = "fail";
  }

  const healthy = checks.postgres === "ok" && checks.mongo === "ok";
  res.status(healthy ? 200 : 503).json({
    status: healthy ? "ok" : "degraded",
    environment: process.env.NODE_ENV || "development",
    checks,
    timestamp: new Date().toISOString(),
  });
});

export default router;