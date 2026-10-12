import { Router } from "express";
import { search } from "../controllers/search.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();
router.use(requireAuth);

router.get("/businesses", asyncHandler(search));

export default router;