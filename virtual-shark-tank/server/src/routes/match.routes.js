import { Router } from "express";
import * as matchController from "../controllers/match.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import { feedQuerySchema } from "../validators/match.validator.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

router.use(requireAuth);

// Static routes first
router.post(
  "/investor/recompute",
  asyncHandler(matchController.recomputeForInvestor)
);

router.get(
  "/investor/feed",
  validate(feedQuerySchema, "query"),
  asyncHandler(matchController.getInvestorFeed)
);

router.post(
  "/business/:id/recompute",
  asyncHandler(matchController.recomputeForBusiness)
);

router.get(
  "/business/:id/feed",
  validate(feedQuerySchema, "query"),
  asyncHandler(matchController.getBusinessFeed)
);

// Parameterized last
router.get("/:id", asyncHandler(matchController.getOne));
router.post("/:id/shortlist", asyncHandler(matchController.shortlist));
router.post("/:id/pass", asyncHandler(matchController.pass));

export default router;