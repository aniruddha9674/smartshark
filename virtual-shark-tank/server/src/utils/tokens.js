import jwt from "jsonwebtoken";
import crypto from "crypto";
import { env } from "../config/env.js";

// ---- Access token (JWT) ----
export const signAccessToken = (payload) =>
  jwt.sign(payload, env.jwtSecret, { expiresIn: env.accessTokenTtl });

export const verifyAccessToken = (token) =>
  jwt.verify(token, env.jwtSecret);

// ---- Refresh token (opaque random string) ----
export const generateRefreshToken = () => {
  const raw = crypto.randomBytes(48).toString("hex");        // 96 chars
  const hash = crypto.createHash("sha256").update(raw).digest("hex");
  return { raw, hash };
};

export const hashRefreshToken = (raw) =>
  crypto.createHash("sha256").update(raw).digest("hex");