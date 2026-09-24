import { Router } from "express";
import * as businessController from "../controllers/businessProfile.controller.js";
import { validate } from "../middleware/validate.middleware.js";
import {
  createBusinessSchema,
  updateBusinessProfileSchema,
} from "../validators/businessProfile.validator.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

router.use(requireAuth);

/**
 * @openapi
 * /api/businesses:
 *   get:
 *     tags: [Business]
 *     summary: List businesses I own
 *     description: Returns all businesses owned by the authenticated user. A user can own multiple.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: My businesses
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 businesses:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/Business' }
 *       401:
 *         description: Not authenticated
 */
router.get("/", asyncHandler(businessController.listMine));

/**
 * @openapi
 * /api/businesses:
 *   post:
 *     tags: [Business]
 *     summary: Create a new business
 *     description: |
 *       Creates a business owned by the authenticated user.
 *       A user can own multiple businesses.
 *       Required: companyName.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [companyName]
 *             properties:
 *               companyName: { type: string, example: Acme Pvt Ltd }
 *               sector: { type: string, example: SaaS }
 *               city: { type: string, example: Bangalore }
 *               description: { type: string }
 *               fundingAsk: { type: number, example: 5000000 }
 *               yearsOperating: { type: integer, example: 3 }
 *     responses:
 *       201:
 *         description: Business created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 business: { $ref: '#/components/schemas/Business' }
 *       400:
 *         description: Validation failed
 *       401:
 *         description: Not authenticated
 */
router.post(
  "/",
  validate(createBusinessSchema),
  asyncHandler(businessController.create)
);

/**
 * @openapi
 * /api/businesses/{id}:
 *   get:
 *     tags: [Business]
 *     summary: Get one business
 *     description: Returns a business. Only the owner can access it.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Business
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 business: { $ref: '#/components/schemas/Business' }
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not the owner
 *       404:
 *         description: Business not found
 */
router.get("/:id", asyncHandler(businessController.getOne));

/**
 * @openapi
 * /api/businesses/{id}:
 *   patch:
 *     tags: [Business]
 *     summary: Update a business
 *     description: |
 *       Partial update. Only the owner can update.
 *       Every change is recorded in `profile_edit_history`.
 *       Unknown fields are stripped.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             minProperties: 1
 *             properties:
 *               companyName: { type: string }
 *               sector: { type: string }
 *               city: { type: string }
 *               description: { type: string }
 *               fundingAsk: { type: number }
 *               yearsOperating: { type: integer }
 *               udyamNumber: { type: string, nullable: true }
 *               gstNumber: { type: string, nullable: true }
 *               shopActLicense: { type: string, nullable: true }
 *     responses:
 *       200:
 *         description: Updated business
 *       400:
 *         description: Validation failed
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not the owner
 *       404:
 *         description: Business not found
 */
router.patch(
  "/:id",
  validate(updateBusinessProfileSchema),
  asyncHandler(businessController.update)
);

/**
 * @openapi
 * /api/businesses/{id}/complete:
 *   post:
 *     tags: [Business]
 *     summary: Mark a business profile as complete
 *     description: |
 *       Validates required fields, then sets `isProfileComplete = true` on the business.
 *       Required: companyName, sector, city, description, fundingAsk, yearsOperating.
 *       Idempotent.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Profile marked complete
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 isProfileComplete: { type: boolean }
 *       400:
 *         description: Profile incomplete (missingFields in details)
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not the owner
 *       404:
 *         description: Business not found
 */
router.post("/:id/complete", asyncHandler(businessController.complete));

/**
 * @openapi
 * /api/businesses/{id}/history:
 *   get:
 *     tags: [Business]
 *     summary: Get a business's profile edit history
 *     description: Reverse-chronological list of profile changes. Only the owner can view.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Edit history
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not the owner
 *       404:
 *         description: Business not found
 */
router.get("/:id/history", asyncHandler(businessController.getHistory));

export default router;