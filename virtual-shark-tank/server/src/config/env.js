import dotenv from "dotenv";
dotenv.config();

const required = [
  "POSTGRES_URI",
  "MONGO_URI",
  "JWT_SECRET",
  "JWT_REFRESH_SECRET",
  "PORT",
];

for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing required env var: ${key}`);
    process.exit(1);
  }
}

export const env = {
  port: Number(process.env.PORT),
 postgresUri: process.env.POSTGRES_URI,
  mongoUri: process.env.MONGO_URI,
  jwtSecret: process.env.JWT_SECRET,
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET,
  nodeEnv: process.env.NODE_ENV || "development",
  accessTokenTtl: "15m",
  refreshTokenTtlDays: 30,
};