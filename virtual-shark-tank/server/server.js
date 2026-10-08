import dotenv from "dotenv";
dotenv.config();
import app from "./src/app.js";
import { testConnection } from "./src/config/db.postgres.js";
import { connectMongo } from "./src/config/db.mongo.js";
import { env } from "./src/config/env.js";
import { scheduleNotificationCleanup } from "./src/jobs/notificationCleanup.job.js";
import cloudinary from "./src/config/cloudinary.js"; 
const start = async () => {
  await testConnection();
  await connectMongo();
  await cloudinary; 

  app.listen(env.port, () => {
    console.log(`Server running on port ${env.port}`);
  });

  // Background maintenance jobs
  scheduleNotificationCleanup();
};

start();