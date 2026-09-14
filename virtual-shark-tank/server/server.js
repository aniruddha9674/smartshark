import dotenv from "dotenv";
dotenv.config();
import app from "./src/app.js";
import { testConnection } from "./src/config/db.postgres.js";
import { connectMongo } from "./src/config/db.mongo.js";

const PORT = process.env.PORT || 5000;

const start = async () => {
  await testConnection();   // Postgres
  await connectMongo();     // MongoDB
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

start();