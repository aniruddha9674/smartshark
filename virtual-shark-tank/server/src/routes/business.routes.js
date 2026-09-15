import { Router } from "express";
import * as businessProfileController from "../controllers/businessProfile.controller.js";
import { validate } from "../middleware/validate.middleware.js";
import { updateBusinessProfileSchema } from "../validators/businessProfile.validator.js";
import { requireAuth, requireRole } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

// Every route in this router requires an authenticated business user
router.use(requireAuth, requireRole("business"));

router.get("/me", asyncHandler(businessProfileController.getMe));

router.patch(
  "/me",
  validate(updateBusinessProfileSchema),
  asyncHandler(businessProfileController.updateMe)
);

router.post(
  "/complete",
  asyncHandler(businessProfileController.complete)
);

router.get(
  "/history",
  asyncHandler(businessProfileController.getHistory)
);

export default router;