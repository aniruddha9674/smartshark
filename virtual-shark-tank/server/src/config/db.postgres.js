import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import dotenv from "dotenv";
dotenv.config();

const client = postgres(process.env.POSTGRES_URI);
export const db = drizzle(client);

export const testConnection = async () => {
  try {
    await client`SELECT 1`;
    console.log("Postgres connected");
  } catch (err) {
    console.error("Postgres connection failed:", err.message);
    process.exit(1);
  }
};