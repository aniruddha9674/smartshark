import { Router } from "express";
import * as ctrl from "../controllers/notification.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();
router.use(requireAuth);

router.get("/", asyncHandler(ctrl.list));
router.get("/unread-count", asyncHandler(ctrl.unreadCount));
router.post("/:id/read", asyncHandler(ctrl.markRead));
router.post("/read-all", asyncHandler(ctrl.markAllRead));
router.delete("/:id", asyncHandler(ctrl.remove));

export default router;