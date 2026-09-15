import { verifyAccessToken } from "../utils/tokens.js";
import { ApiError } from "../utils/apiError.js";

export const requireAuth = (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return next(ApiError.unauthorized("No token provided"));
  }

  const token = header.slice(7);
  try {
    req.user = verifyAccessToken(token); // { id, role, iat, exp }
    next();
  } catch {
    next(ApiError.unauthorized("Invalid or expired token"));
  }
};

export const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return next(ApiError.unauthorized());
  if (!roles.includes(req.user.role)) {
    return next(ApiError.forbidden("Insufficient permissions"));
  }
  next();
};