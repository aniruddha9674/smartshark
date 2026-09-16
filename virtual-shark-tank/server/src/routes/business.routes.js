import { Router } from "express";
import * as businessProfileController from "../controllers/businessProfile.controller.js";
import { validate } from "../middleware/validate.middleware.js";
import { updateBusinessProfileSchema } from "../validators/businessProfile.validator.js";
import { requireAuth, requireRole } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

// Every route in this router requires an authenticated business user
router.use(requireAuth, requireRole("business"));

/**
 * @openapi
 * /api/business/me:
 *   get:
 *     tags: [Business Profile]
 *     summary: Get the current business's profile
 *     description: Returns the business profile for the authenticated business user. Requires role=business.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Business profile
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 profile:
 *                   $ref: '#/components/schemas/BusinessProfile'
 *       401:
 *         description: No token or invalid token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Not a business user
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
router.get("/me", asyncHandler(businessProfileController.getMe));

/**
 * @openapi
 * /api/business/me:
 *   patch:
 *     tags: [Business Profile]
 *     summary: Update the current business's profile
 *     description: |
 *       Partial update — send only the fields you want to change.
 *       Every change is written to `profile_edit_history` for auditing.
 *       Unknown fields (like `verificationTier` or `userId`) are stripped.
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
 *               companyName:
 *                 type: string
 *                 minLength: 2
 *                 maxLength: 255
 *                 example: Acme Pvt Ltd
 *               sector:
 *                 type: string
 *                 example: SaaS
 *               city:
 *                 type: string
 *                 example: Bangalore
 *               description:
 *                 type: string
 *                 example: We build B2B SaaS tools for Indian SMEs.
 *               fundingAsk:
 *                 type: number
 *                 example: 5000000
 *               yearsOperating:
 *                 type: integer
 *                 example: 3
 *               udyamNumber:
 *                 type: string
 *                 nullable: true
 *                 example: UDYAM-KA-01-0012345
 *               gstNumber:
 *                 type: string
 *                 nullable: true
 *                 example: 29ABCDE1234F1Z5
 *               shopActLicense:
 *                 type: string
 *                 nullable: true
 *     responses:
 *       200:
 *         description: Updated profile
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 profile:
 *                   $ref: '#/components/schemas/BusinessProfile'
 *       400:
 *         description: Validation failed (e.g. empty body, negative fundingAsk)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not a business user
 *       404:
 *         description: Profile not found
 */
router.patch(
  "/me",
  validate(updateBusinessProfileSchema),
  asyncHandler(businessProfileController.updateMe)
);

/**
 * @openapi
 * /api/business/complete:
 *   post:
 *     tags: [Business Profile]
 *     summary: Mark the business profile as complete
 *     description: |
 *       Validates that all required fields are present, then sets
 *       `users.isProfileComplete = true`. Once complete, the business
 *       can publish pitches and appears live on the platform.
 *
 *       Required fields: companyName, sector, city, description, fundingAsk, yearsOperating.
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
 *                       example: [companyName, sector, fundingAsk]
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not a business user
 *       404:
 *         description: Profile not found
 */
router.post(
  "/complete",
  asyncHandler(businessProfileController.complete)
);

/**
 * @openapi
 * /api/business/history:
 *   get:
 *     tags: [Business Profile]
 *     summary: Get the business's profile edit history
 *     description: Returns a reverse-chronological list of every field change made to the business profile. Powers the History tab.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Profile edit history, newest first
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 history:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/ProfileEdit'
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not a business user
 */
router.get(
  "/history",
  asyncHandler(businessProfileController.getHistory)
);

export default router;