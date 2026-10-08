import multer from "multer";
import { ApiError } from "../utils/apiError.js";
import { env } from "../config/env.js";

export const errorHandler = (err, req, res, next) => {
  // 1. Multer errors (file upload issues)
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({
        error: "File too large. Maximum allowed size is 10 MB.",
      });
    }
    if (err.code === "LIMIT_UNEXPECTED_FILE") {
      return res.status(400).json({
        error: "Unexpected file field. Use 'file' as the field name.",
      });
    }
    // Other Multer errors (e.g., too many files)
    return res.status(400).json({ error: err.message });
  }

  // 2. Custom file type rejection from our fileFilter
  if (err.message && err.message.includes("Invalid file type")) {
    return res.status(415).json({ error: err.message });
  }

  // 3. Your existing ApiError handling
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      error: err.message,
      details: err.details,
    });
  }

  // 4. Fallback for unexpected errors
  console.error("Unhandled error:", err);
  res.status(500).json({
    error: "Internal server error",
    ...(env.nodeEnv === "development" && { stack: err.stack }),
  });
};