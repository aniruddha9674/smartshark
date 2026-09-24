import { eq, and, gt, sql } from "drizzle-orm";
import { db } from "../config/db.postgres.js";
import {
  users,
  refreshTokens,
  businesses,
  investorProfiles,
} from "../models/postgres/index.js";
import { hashPassword, verifyPassword } from "../utils/password.js";
import {
  signAccessToken,
  generateRefreshToken,
  hashRefreshToken,
} from "../utils/tokens.js";
import { ApiError } from "../utils/apiError.js";
import { env } from "../config/env.js";

const REFRESH_TTL_MS = env.refreshTokenTtlDays * 24 * 60 * 60 * 1000;

// ---------- Register ----------
// No `role` param. Users register with just identity.
// They add a business or become an investor afterwards.
export const registerUser = async ({ name, email, password }) => {
  const existing = await db.query.users.findFirst({
    where: eq(users.email, email),
  });
  if (existing) throw ApiError.conflict("Email already in use");

  const passwordHash = await hashPassword(password);

  const [user] = await db
    .insert(users)
    .values({ name, email, passwordHash })
    .returning();

  const tokens = await issueTokens(user, null);
  const enriched = await enrichWithCapabilities(user);
  return { user: enriched, ...tokens };
};

// ---------- Login ----------
export const loginUser = async ({ email, password }, userAgent) => {
  const user = await db.query.users.findFirst({
    where: eq(users.email, email),
  });

  if (!user) throw ApiError.unauthorized("Invalid credentials");
  if (!user.isActive) throw ApiError.forbidden("Account is disabled");

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) throw ApiError.unauthorized("Invalid credentials");

  const tokens = await issueTokens(user, userAgent);
  const enriched = await enrichWithCapabilities(user);
  return { user: enriched, ...tokens };
};

// ---------- Refresh ----------
export const refreshSession = async (rawRefreshToken, userAgent) => {
  if (!rawRefreshToken) throw ApiError.unauthorized("No refresh token");

  const tokenHash = hashRefreshToken(rawRefreshToken);

  const stored = await db.query.refreshTokens.findFirst({
    where: and(
      eq(refreshTokens.tokenHash, tokenHash),
      eq(refreshTokens.revoked, false),
      gt(refreshTokens.expiresAt, new Date())
    ),
  });

  if (!stored) throw ApiError.unauthorized("Invalid or expired refresh token");

  const user = await db.query.users.findFirst({
    where: eq(users.id, stored.userId),
  });
  if (!user || !user.isActive) throw ApiError.unauthorized("User not found");

  // Rotate: revoke old, issue new
  await db
    .update(refreshTokens)
    .set({ revoked: true })
    .where(eq(refreshTokens.id, stored.id));

  const tokens = await issueTokens(user, userAgent);
  const enriched = await enrichWithCapabilities(user);
  return { user: enriched, ...tokens };
};

// ---------- Logout ----------
export const logoutUser = async (rawRefreshToken) => {
  if (!rawRefreshToken) return;
  const tokenHash = hashRefreshToken(rawRefreshToken);
  await db
    .update(refreshTokens)
    .set({ revoked: true })
    .where(eq(refreshTokens.tokenHash, tokenHash));
};

// ---------- Get current user (for /me) ----------
export const getCurrentUser = async (userId) => {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });
  if (!user) throw ApiError.notFound("User not found");
  return await enrichWithCapabilities(user);
};

// ---------- Helpers ----------

const issueTokens = async (user, userAgent) => {
  // JWT now carries id + isAdmin. Capabilities are checked per-request.
  const accessToken = signAccessToken({
    id: user.id,
    isAdmin: user.isAdmin,
  });

  const { raw, hash } = generateRefreshToken();
  await db.insert(refreshTokens).values({
    userId: user.id,
    tokenHash: hash,
    userAgent: userAgent || null,
    expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
  });

  return { accessToken, refreshToken: raw };
};

// Strip sensitive fields
const sanitize = (user) => {
  const { passwordHash, ...rest } = user;
  return rest;
};

// Attach capabilities derived from data — no more role column.
// One query for business count, one for investor profile row.
const enrichWithCapabilities = async (user) => {
  const sanitized = sanitize(user);

  const [businessCountRow, investorRow] = await Promise.all([
    db
      .select({ count: sql`count(*)`.mapWith(Number) })
      .from(businesses)
      .where(eq(businesses.ownerId, user.id)),
    db.query.investorProfiles.findFirst({
      where: eq(investorProfiles.userId, user.id),
      columns: { id: true, isComplete: true },
    }),
  ]);

  const businessCount = businessCountRow[0]?.count ?? 0;

  return {
    ...sanitized,
    capabilities: {
      isAdmin: user.isAdmin,
      hasBusiness: businessCount > 0,
      businessCount,
      isInvestor: !!investorRow,
      isInvestorProfileComplete: investorRow?.isComplete ?? false,
    },
  };
};