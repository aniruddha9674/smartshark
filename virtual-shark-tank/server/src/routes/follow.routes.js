import { Router } from "express";
import * as followController from "../controllers/follow.controller.js";
import { validate } from "../middleware/validate.middleware.js";
import { paginationQuerySchema } from "../validators/follow.validator.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

router.use(requireAuth);

/**
 * @openapi
 * /api/follows/following:
 *   get:
 *     tags: [Follows]
 *     summary: List everything I follow (businesses + investors)
 *     description: Returns a mixed list of businesses and investors the authenticated user follows, newest first.
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
 *         description: Paginated list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 following:
 *                   type: array
 *                   items: { type: object }
 *                 pagination: { $ref: '#/components/schemas/Pagination' }
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
 * /api/follows/investor/followers:
 *   get:
 *     tags: [Follows]
 *     summary: Who follows me (as an investor)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of followers
 *       401:
 *         description: Not authenticated
 */
router.get(
  "/investor/followers",
  validate(paginationQuerySchema, "query"),
  asyncHandler(followController.getInvestorFollowers)
);

/**
 * @openapi
 * /api/follows/status/business/{id}:
 *   get:
 *     tags: [Follows]
 *     summary: Am I following this business?
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 following: { type: boolean }
 */
router.get("/status/business/:id", asyncHandler(followController.getBusinessStatus));

/**
 * @openapi
 * /api/follows/status/investor/{id}:
 *   get:
 *     tags: [Follows]
 *     summary: Am I following this investor?
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Status
 */
router.get("/status/investor/:id", asyncHandler(followController.getInvestorStatus));

/**
 * @openapi
 * /api/follows/business/{id}:
 *   post:
 *     tags: [Follows]
 *     summary: Follow a business
 *     description: Idempotent. Cannot follow a business you own.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       201:
 *         description: Followed
 *       400:
 *         description: Cannot follow your own business
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Business not found
 *   delete:
 *     tags: [Follows]
 *     summary: Unfollow a business
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Unfollowed
 */
router.post("/business/:id", asyncHandler(followController.followBusiness));
router.delete("/business/:id", asyncHandler(followController.unfollowBusiness));

/**
 * @openapi
 * /api/follows/business/{id}/followers:
 *   get:
 *     tags: [Follows]
 *     summary: Who follows a business
 *     description: Only the business owner can see their followers.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Followers list
 *       403:
 *         description: You do not own this business
 */
router.get(
  "/business/:id/followers",
  validate(paginationQuerySchema, "query"),
  asyncHandler(followController.getBusinessFollowers)
);

/**
 * @openapi
 * /api/follows/investor/{id}:
 *   post:
 *     tags: [Follows]
 *     summary: Follow an investor
 *     description: Idempotent. Target must have an investor profile. Cannot follow yourself.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       201:
 *         description: Followed
 *       400:
 *         description: Cannot follow yourself or non-investor
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: User not found
 *   delete:
 *     tags: [Follows]
 *     summary: Unfollow an investor
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Unfollowed
 */
router.post("/investor/:id", asyncHandler(followController.followInvestor));
router.delete("/investor/:id", asyncHandler(followController.unfollowInvestor));

export default router;