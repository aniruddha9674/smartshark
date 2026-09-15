import { Router } from "express";
import * as pitchController from "../controllers/pitch.controller.js";
import { validate } from "../middleware/validate.middleware.js";
import {
  createPitchSchema,
  updatePitchSchema,
} from "../validators/pitch.validator.js";
import { requireAuth, requireRole } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

// ---- Public-ish routes: any authenticated user ----
// GET /:id must be declared BEFORE /me routes would conflict if not careful.
// Put specific paths first.

router.get(
  "/",
  requireAuth,
  asyncHandler(pitchController.listLive)
);

router.get(
  "/me",
  requireAuth,
  requireRole("business"),
  asyncHandler(pitchController.listMine)
);

router.post(
  "/",
  requireAuth,
  requireRole("business"),
  validate(createPitchSchema),
  asyncHandler(pitchController.create)
);

router.get(
  "/:id",
  requireAuth,
  asyncHandler(pitchController.getOne)
);

router.patch(
  "/:id",
  requireAuth,
  requireRole("business"),
  validate(updatePitchSchema),
  asyncHandler(pitchController.update)
);

router.post(
  "/:id/publish",
  requireAuth,
  requireRole("business"),
  asyncHandler(pitchController.publish)
);

router.post(
  "/:id/close",
  requireAuth,
  requireRole("business"),
  asyncHandler(pitchController.close)
);

router.delete(
  "/:id",
  requireAuth,
  requireRole("business"),
  asyncHandler(pitchController.remove)
);

export default router;