import { Router } from "express";
import * as pitchController from "../controllers/pitch.controller.js";
import { validate } from "../middleware/validate.middleware.js";
import {
  createPitchSchema,
  updatePitchSchema,
} from "../validators/pitch.validator.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

/**
 * @openapi
 * /api/pitches:
 *   get:
 *     tags: [Pitches]
 *     summary: List all live pitches (investor feed)
 *     description: Returns only pitches with status=live, newest first. Supports stage, revenueRange, and businessId filters.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: stage
 *         schema: { type: string, enum: [idea, mvp, early_revenue, growth, scale] }
 *       - in: query
 *         name: revenueRange
 *         schema: { type: string, enum: [pre_revenue, under_10L, 10L_1Cr, 1Cr_10Cr, 10Cr_plus] }
 *       - in: query
 *         name: businessId
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50, maximum: 100 }
 *       - in: query
 *         name: offset
 *         schema: { type: integer, default: 0 }
 *     responses:
 *       200:
 *         description: Live pitches
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 pitches:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/Pitch' }
 *       401:
 *         description: Not authenticated
 */
router.get("/", requireAuth, asyncHandler(pitchController.listLive));

/**
 * @openapi
 * /api/pitches/me:
 *   get:
 *     tags: [Pitches]
 *     summary: List my pitches for a specific business
 *     description: Returns all pitches owned by the given business (any status). Requires businessId query param and ownership of that business.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: businessId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: My pitches
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 pitches:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/Pitch' }
 *       400:
 *         description: businessId query param missing
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: You do not own this business
 */
router.get("/me", requireAuth, asyncHandler(pitchController.listMine));

/**
 * @openapi
 * /api/pitches:
 *   post:
 *     tags: [Pitches]
 *     summary: Create a draft pitch
 *     description: Creates a draft pitch for a business you own. `businessId` is required in the body.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PitchCreate'
 *     responses:
 *       201:
 *         description: Draft pitch created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 pitch: { $ref: '#/components/schemas/Pitch' }
 *       400:
 *         description: Validation failed
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: You do not own this business
 *       404:
 *         description: Business not found
 */
router.post(
  "/",
  requireAuth,
  validate(createPitchSchema),
  asyncHandler(pitchController.create)
);

/**
 * @openapi
 * /api/pitches/{id}:
 *   get:
 *     tags: [Pitches]
 *     summary: Get a pitch by ID
 *     description: Owner sees any status; others see only live pitches.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Pitch
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 pitch: { $ref: '#/components/schemas/Pitch' }
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Pitch not found or not visible
 */
router.get("/:id", requireAuth, asyncHandler(pitchController.getOne));

/**
 * @openapi
 * /api/pitches/{id}:
 *   patch:
 *     tags: [Pitches]
 *     summary: Update a draft pitch
 *     description: Only the owner can update. Only draft pitches are editable.
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
 *             $ref: '#/components/schemas/PitchUpdate'
 *     responses:
 *       200:
 *         description: Updated pitch
 *       400:
 *         description: Not editable
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not the owner
 *       404:
 *         description: Pitch not found
 */
router.patch(
  "/:id",
  requireAuth,
  validate(updatePitchSchema),
  asyncHandler(pitchController.update)
);

/**
 * @openapi
 * /api/pitches/{id}/publish:
 *   post:
 *     tags: [Pitches]
 *     summary: Publish a draft pitch
 *     description: Moves draft → live. Requires complete business profile, all required fields, and no other live pitch for the same business.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Published
 *       400:
 *         description: Pitch incomplete or wrong status
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not the owner
 *       404:
 *         description: Pitch not found
 *       409:
 *         description: Business already has a live pitch
 */
router.post("/:id/publish", requireAuth, asyncHandler(pitchController.publish));

/**
 * @openapi
 * /api/pitches/{id}/close:
 *   post:
 *     tags: [Pitches]
 *     summary: Close a live pitch
 *     description: Moves live → closed. Only the owner can close.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Closed
 *       400:
 *         description: Not live
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not the owner
 *       404:
 *         description: Pitch not found
 */
router.post("/:id/close", requireAuth, asyncHandler(pitchController.close));

/**
 * @openapi
 * /api/pitches/{id}:
 *   delete:
 *     tags: [Pitches]
 *     summary: Delete a draft pitch
 *     description: Only draft pitches can be deleted.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Deleted
 *       400:
 *         description: Only drafts can be deleted
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not the owner
 *       404:
 *         description: Pitch not found
 */
router.delete("/:id", requireAuth, asyncHandler(pitchController.remove));

export default router;