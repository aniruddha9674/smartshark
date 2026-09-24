import { Router } from "express";
import * as investorProfileController from "../controllers/investorProfile.controller.js";
import { validate } from "../middleware/validate.middleware.js";
import { updateInvestorProfileSchema } from "../validators/investorProfile.validator.js";
import { requireAuth, requireInvestor } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

router.use(requireAuth);

/**
 * @openapi
 * /api/investor/me:
 *   post:
 *     tags: [Investor Profile]
 *     summary: Become an investor (create investor profile)
 *     description: |
 *       Creates an investor profile for the authenticated user. Idempotent —
 *       if a profile already exists, returns it with 200 instead of 201.
 *
 *       Any authenticated user can call this. Once created, the user can
 *       access all other investor endpoints and appears in business feeds
 *       as a potential investor.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Investor profile created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 profile:
 *                   $ref: '#/components/schemas/InvestorProfile'
 *       200:
 *         description: Investor profile already exists
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 profile:
 *                   $ref: '#/components/schemas/InvestorProfile'
 *       401:
 *         description: Not authenticated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post(
  "/me",
  asyncHandler(investorProfileController.createOrGet)
);

/**
 * @openapi
 * /api/investor/me:
 *   get:
 *     tags: [Investor Profile]
 *     summary: Get my investor profile
 *     description: Returns the authenticated user's investor profile. Requires an existing investor profile (call POST /me first).
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
 *         description: Not authenticated
 *       403:
 *         description: No investor profile — call POST /api/investor/me first
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Profile not found
 */
router.get(
  "/me",
  requireInvestor,
  asyncHandler(investorProfileController.getMe)
);

/**
 * @openapi
 * /api/investor/me:
 *   patch:
 *     tags: [Investor Profile]
 *     summary: Update my investor profile
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
 *         description: Updated investor profile
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 profile:
 *                   $ref: '#/components/schemas/InvestorProfile'
 *       400:
 *         description: Validation failed (e.g. min > max, empty body)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: No investor profile
 *       404:
 *         description: Profile not found
 */
router.patch(
  "/me",
  requireInvestor,
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
 *       `investor_profiles.is_complete = true`. Once complete, the investor
 *       appears live on the platform and can be matched with businesses.
 *
 *       Required fields: firmName, investmentFocus, preferredGeography,
 *       minTicketSize, maxTicketSize.
 *
 *       Idempotent — calling multiple times is safe.
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
 *                 isComplete:
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
 *         description: No investor profile
 *       404:
 *         description: Profile not found
 */
router.post(
  "/complete",
  requireInvestor,
  asyncHandler(investorProfileController.complete)
);

export default router;