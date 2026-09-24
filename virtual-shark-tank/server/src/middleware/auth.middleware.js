import { eq } from "drizzle-orm";
import { verifyAccessToken } from "../utils/tokens.js";
import { ApiError } from "../utils/apiError.js";
import { db } from "../config/db.postgres.js";
import { businesses, investorProfiles } from "../models/postgres/index.js";

// ---------- Auth ----------
export const requireAuth = (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return next(ApiError.unauthorized("No token provided"));
  }

  const token = header.slice(7);
  try {
    req.user = verifyAccessToken(token); // { id, isAdmin }
    next();
  } catch {
    next(ApiError.unauthorized("Invalid or expired token"));
  }
};

// ---------- Admin gate ----------
export const requireAdmin = (req, res, next) => {
  if (!req.user) return next(ApiError.unauthorized());
  if (!req.user.isAdmin) return next(ApiError.forbidden("Admin only"));
  next();
};

// ---------- Business ownership ----------
// Reads businessId from req.params.businessId or req.params.id.
// Verifies the logged-in user owns it. Attaches req.business.
export const requireBusinessOwner = async (req, res, next) => {
  try {
    if (!req.user) return next(ApiError.unauthorized());

    const businessId = req.params.businessId || req.params.id;
    if (!businessId) {
      return next(ApiError.badRequest("Business ID required"));
    }

    const business = await db.query.businesses.findFirst({
      where: eq(businesses.id, businessId),
    });
    if (!business) return next(ApiError.notFound("Business not found"));
    if (business.ownerId !== req.user.id) {
      return next(ApiError.forbidden("You do not own this business"));
    }

    req.business = business;
    next();
  } catch (err) {
    next(err);
  }
};

// ---------- Investor gate ----------
// Verifies the user has an investor profile row.
export const requireInvestor = async (req, res, next) => {
  try {
    if (!req.user) return next(ApiError.unauthorized());

    const profile = await db.query.investorProfiles.findFirst({
      where: eq(investorProfiles.userId, req.user.id),
    });
    if (!profile) {
      return next(ApiError.forbidden("Investor profile required"));
    }

    req.investorProfile = profile;
    next();
  } catch (err) {
    next(err);
  }
};