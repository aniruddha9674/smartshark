import { Router } from "express";
import * as investorProfileController from "../controllers/investorProfile.controller.js";
import { validate } from "../middleware/validate.middleware.js";
import { updateInvestorProfileSchema } from "../validators/investorProfile.validator.js";
import { requireAuth, requireRole } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

router.use(requireAuth, requireRole("investor"));

/**
 * @openapi
 * /api/investor/me:
 *   get:
 *     tags: [Investor Profile]
 *     summary: Get the current investor's profile
 *     description: Returns the investor profile for the authenticated investor user. Requires role=investor.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Investor profile
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 profile:
 *                   $ref: '#/components/schemas/InvestorProfile'
 *       401:
 *         description: No token or invalid token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Not an investor user
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Profile not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get("/me", asyncHandler(investorProfileController.getMe));

/**
 * @openapi
 * /api/investor/me:
 *   patch:
 *     tags: [Investor Profile]
 *     summary: Update the current investor's profile
 *     description: |
 *       Partial update — send only the fields you want to change.
 *
 *       Business rule: if both `minTicketSize` and `maxTicketSize` are set
 *       (either in this request or already in the DB), `minTicketSize` must be
 *       less than or equal to `maxTicketSize`. The service validates against
 *       the existing DB values, not just the payload.
 *
 *       Unknown fields (like `isIdentityVerified` or `userId`) are stripped.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             minProperties: 1
 *             properties:
 *               firmName:
 *                 type: string
 *                 minLength: 2
 *                 maxLength: 255
 *                 example: Peak Ventures
 *               investmentFocus:
 *                 type: string
 *                 example: SaaS, Fintech
 *               preferredGeography:
 *                 type: string
 *                 example: India, Southeast Asia
 *               minTicketSize:
 *                 type: number
 *                 example: 500000
 *               maxTicketSize:
 *                 type: number
 *                 example: 5000000
 *               panNumber:
 *                 type: string
 *                 nullable: true
 *                 example: ABCDE1234F
 *     responses:
 *       200:
 *         description: Updated profile
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 profile:
 *                   $ref: '#/components/schemas/InvestorProfile'
 *       400:
 *         description: Validation failed (e.g. min > max, negative ticket size, empty body)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not an investor user
 *       404:
 *         description: Profile not found
 */
router.patch(
  "/me",
  validate(updateInvestorProfileSchema),
  asyncHandler(investorProfileController.updateMe)
);

/**
 * @openapi
 * /api/investor/complete:
 *   post:
 *     tags: [Investor Profile]
 *     summary: Mark the investor profile as complete
 *     description: |
 *       Validates that all required fields are present, then sets
 *       `users.isProfileComplete = true`. Once complete, the investor
 *       appears live on the platform and can be matched with businesses.
 *
 *       Required fields: firmName, investmentFocus, preferredGeography, minTicketSize, maxTicketSize.
 *
 *       This endpoint is idempotent — calling it multiple times is safe.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Profile marked complete
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 isProfileComplete:
 *                   type: boolean
 *                   example: true
 *       400:
 *         description: Profile is missing required fields
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Profile incomplete
 *                 details:
 *                   type: object
 *                   properties:
 *                     missingFields:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: [firmName, minTicketSize]
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not an investor user
 *       404:
 *         description: Profile not found
 */
router.post(
  "/complete",
  asyncHandler(investorProfileController.complete)
);

export default router;