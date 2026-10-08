import { Router } from "express";
import { upload } from "../middleware/upload.middleware.js";
import { uploadFile } from "../controllers/upload.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

/**
 * @openapi
 * /api/uploads:
 *   post:
 *     tags: [Uploads]
 *     summary: Upload a verification document
 *     description: Accepts a single file (JPEG, PNG, WebP, or PDF, max 10 MB). Stores in Cloudinary under verification-docs/{userId}.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Upload successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     url: { type: string }
 *                     publicId: { type: string }
 *       400:
 *         description: No file provided
 *       401:
 *         description: Not authenticated
 *       413:
 *         description: File too large
 *       415:
 *         description: Unsupported file type
 */
router.post(
  "/",
  requireAuth,
  upload.single("file"),
  asyncHandler(uploadFile)
);

export default router;