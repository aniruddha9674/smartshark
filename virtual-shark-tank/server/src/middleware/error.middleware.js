import { ApiError } from "../utils/apiError.js";
import { env } from "../config/env.js";

export const errorHandler = (err, req, res, next) => {
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      error: err.message,
      details: err.details,
    });
  }

  console.error("Unhandled error:", err);
  res.status(500).json({
    error: "Internal server error",
    ...(env.nodeEnv === "development" && { stack: err.stack }),
  });
};