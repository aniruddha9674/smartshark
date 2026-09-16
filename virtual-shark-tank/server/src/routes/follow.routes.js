import { Router } from "express";
import * as followController from "../controllers/follow.controller.js";
import { validate } from "../middleware/validate.middleware.js";
import { paginationQuerySchema } from "../validators/follow.validator.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

// Every route requires authentication
router.use(requireAuth);

/**
 * @openapi
 * /api/follows/following:
 *   get:
 *     tags: [Follows]
 *     summary: List users I follow
 *     description: Returns the users the authenticated user follows, newest first. Each entry is enriched with the user's role-specific profile (business or investor).
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20, maximum: 100 }
 *       - in: query
 *         name: offset
 *         schema: { type: integer, default: 0 }
 *     responses:
 *       200:
 *         description: Paginated list of followed users
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 users:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/FollowedUser'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 *       401:
 *         description: Not authenticated
 */
router.get(
  "/following",
  validate(paginationQuerySchema, "query"),
  asyncHandler(followController.getFollowing)
);

/**
 * @openapi
 * /api/follows/followers:
 *   get:
 *     tags: [Follows]
 *     summary: List users who follow me
 *     description: Returns the users following the authenticated user, newest first. Enriched per role.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20, maximum: 100 }
 *       - in: query
 *         name: offset
 *         schema: { type: integer, default: 0 }
 *     responses:
 *       200:
 *         description: Paginated list of followers
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 users:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/FollowedUser'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 *       401:
 *         description: Not authenticated
 */
router.get(
  "/followers",
  validate(paginationQuerySchema, "query"),
  asyncHandler(followController.getFollowers)
);

/**
 * @openapi
 * /api/follows/status/{userId}:
 *   get:
 *     tags: [Follows]
 *     summary: Check if I follow a user
 *     description: Returns whether the authenticated user follows the specified user.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Follow status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 following: { type: boolean }
 *       401:
 *         description: Not authenticated
 */
router.get(
  "/status/:userId",
  asyncHandler(followController.getStatus)
);

/**
 * @openapi
 * /api/follows/{userId}:
 *   post:
 *     tags: [Follows]
 *     summary: Follow a user
 *     description: |
 *       Creates a follow relationship. Idempotent — following the same user
 *       twice returns success without creating a duplicate.
 *
 *       Rules:
 *       - Cannot follow yourself (400)
 *       - Cannot follow an inactive user (400)
 *       - Cannot follow a nonexistent user (404)
 *
 *       Creates a `follow` notification for the target user, respecting their
 *       `notifyFollow` preference.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       201:
 *         description: Follow created (or was already following)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 following: { type: boolean, example: true }
 *                 alreadyFollowing: { type: boolean, example: false }
 *       400:
 *         description: Cannot follow yourself, or target is inactive
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: User not found
 */
router.post(
  "/:userId",
  asyncHandler(followController.follow)
);

/**
 * @openapi
 * /api/follows/{userId}:
 *   delete:
 *     tags: [Follows]
 *     summary: Unfollow a user
 *     description: Removes the follow relationship. Idempotent — unfollowing someone you don't follow succeeds without error.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Unfollowed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 following: { type: boolean, example: false }
 *                 wasFollowing: { type: boolean, example: true }
 *       400:
 *         description: Cannot unfollow yourself
 *       401:
 *         description: Not authenticated
 */
router.delete(
  "/:userId",
  asyncHandler(followController.unfollow)
);

export default router;