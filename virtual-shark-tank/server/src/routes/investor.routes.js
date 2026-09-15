import { Router } from "express";
import * as investorProfileController from "../controllers/investorProfile.controller.js";
import { validate } from "../middleware/validate.middleware.js";
import { updateInvestorProfileSchema } from "../validators/investorProfile.validator.js";
import { requireAuth, requireRole } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

router.use(requireAuth, requireRole("investor"));

router.get("/me", asyncHandler(investorProfileController.getMe));

router.patch(
  "/me",
  validate(updateInvestorProfileSchema),
  asyncHandler(investorProfileController.updateMe)
);

router.post(
  "/complete",
  asyncHandler(investorProfileController.complete)
);

export default router;