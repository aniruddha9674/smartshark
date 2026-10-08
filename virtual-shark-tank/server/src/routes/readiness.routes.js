import { Router } from "express";
import * as businessController from "../controllers/business.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import { readinessTrendQuerySchema } from "../validators/readiness.validator.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

router.use(requireAuth);

router.post(
  "/:id/readiness/recompute",
  asyncHandler(businessController.recomputeReadiness)
);

router.get(
  "/:id/readiness",
  asyncHandler(businessController.getReadiness)
);

router.get(
  "/:id/readiness/trend",
  validate(readinessTrendQuerySchema, "query"),
  asyncHandler(businessController.getReadinessTrend)
);

export default router;