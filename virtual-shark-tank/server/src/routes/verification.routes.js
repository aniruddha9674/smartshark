import { Router } from "express";
import * as verificationController from "../controllers/verification.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import {
  createVerificationSchema,
  listVerificationsQuerySchema,
  applyVerificationSchema,
} from "../validators/verification.validator.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();
router.use(requireAuth);

router.post(
  "/",
  validate(createVerificationSchema),
  asyncHandler(verificationController.create)
);

router.get(
  "/me",
  validate(listVerificationsQuerySchema, "query"),
  asyncHandler(verificationController.listMine)
);

router.post(
  "/:id/apply",
  validate(applyVerificationSchema),
  asyncHandler(verificationController.apply)
);

router.get("/:id", asyncHandler(verificationController.getOne));

export default router;