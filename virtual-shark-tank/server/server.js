import dotenv from "dotenv";
dotenv.config();

import app from "./src/app.js";
import { testConnection, pool } from "./src/config/db.postgres.js";
import { connectMongo } from "./src/config/db.mongo.js";
import { env } from "./src/config/env.js";
import { scheduleNotificationCleanup } from "./src/jobs/notificationCleanup.job.js";
import cloudinary from "./src/config/cloudinary.js";
import { logger } from "./src/config/logger.js";
import mongoose from "mongoose";

const start = async () => {
  await testConnection();
  await connectMongo();
  await cloudinary; // ensure SDK is configured at boot

  const server = app.listen(env.port, () => {
    logger.info(
      { port: env.port, env: env.nodeEnv || "development" },
      "Server started"
    );
  });

  // Background maintenance jobs
  scheduleNotificationCleanup();

  const shutdown = (signal) => {
    logger.info({ signal }, "Shutdown signal received — draining connections");

    server.close(async () => {
  try {
    if (pool) await pool.end();
    await mongoose.disconnect();
    logger.info("Clean shutdown complete");
    process.exit(0);
  } catch (err) {
    logger.error({ err }, "Error during shutdown");
    process.exit(1);
  }
});

    // Force-exit if graceful shutdown hangs past 30s
    setTimeout(() => {
      logger.error("Forced shutdown after 30s timeout");
      process.exit(1);
    }, 30_000).unref();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
};

start().catch((err) => {
  logger.error({ err }, "Failed to start server");
  process.exit(1);
});