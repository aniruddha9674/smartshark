import { Router } from "express";
import * as pitchController from "../controllers/pitch.controller.js";
import { validate } from "../middleware/validate.middleware.js";
import {
  createPitchSchema,
  updatePitchSchema,
} from "../validators/pitch.validator.js";
import { requireAuth, requireRole } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

/**
 * @openapi
 * /api/pitches:
 *   get:
 *     tags: [Pitches]
 *     summary: List all live pitches (investor feed base)
 *     description: Returns only pitches with status=live, newest first. Supports stage and revenueRange filters.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: stage
 *         schema:
 *           type: string
 *           enum: [idea, mvp, early_revenue, growth, scale]
 *       - in: query
 *         name: revenueRange
 *         schema:
 *           type: string
 *           enum: [pre_revenue, under_10L, 10L_1Cr, 1Cr_10Cr, 10Cr_plus]
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *           maximum: 100
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
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
 *                   items:
 *                     $ref: '#/components/schemas/Pitch'
 *       401:
 *         description: Not authenticated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get("/", requireAuth, asyncHandler(pitchController.listLive));

/**
 * @openapi
 * /api/pitches/me:
 *   get:
 *     tags: [Pitches]
 *     summary: List my pitches (business owner)
 *     description: Returns all pitches owned by the authenticated business, in any status (draft, live, closed).
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: My pitches, newest first
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 pitches:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Pitch'
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not a business user
 */
router.get(
  "/me",
  requireAuth,
  requireRole("business"),
  asyncHandler(pitchController.listMine)
);

/**
 * @openapi
 * /api/pitches:
 *   post:
 *     tags: [Pitches]
 *     summary: Create a draft pitch
 *     description: |
 *       Creates a new pitch with status=draft. Required fields are only `title`,
 *       `askAmount`, and `equityOffered` — everything else can be filled in
 *       via PATCH before publishing.
 *
 *       `valuation` is computed automatically as `askAmount / (equityOffered / 100)`.
 *
 *       The `status` field is stripped from the body — a business cannot
 *       self-publish on create.
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
 *                 pitch:
 *                   $ref: '#/components/schemas/Pitch'
 *       400:
 *         description: Validation failed
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not a business user
 */
router.post(
  "/",
  requireAuth,
  requireRole("business"),
  validate(createPitchSchema),
  asyncHandler(pitchController.create)
);

/**
 * @openapi
 * /api/pitches/{id}:
 *   get:
 *     tags: [Pitches]
 *     summary: Get a pitch by ID
 *     description: |
 *       Returns a pitch. The owner can see any status; anyone else can only
 *       see live pitches. Non-owners requesting a draft get 404 (not 403) so
 *       the existence of drafts is not leaked.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Pitch
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 pitch:
 *                   $ref: '#/components/schemas/Pitch'
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Pitch not found, or not visible to this user
 */
router.get("/:id", requireAuth, asyncHandler(pitchController.getOne));

/**
 * @openapi
 * /api/pitches/{id}:
 *   patch:
 *     tags: [Pitches]
 *     summary: Update a draft pitch
 *     description: |
 *       Only the owner can update. Only `draft` pitches are editable —
 *       live and closed pitches are immutable.
 *
 *       Partial update: send only the fields you want to change.
 *       If `askAmount` or `equityOffered` changes, `valuation` is recomputed.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PitchUpdate'
 *     responses:
 *       200:
 *         description: Updated pitch
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 pitch:
 *                   $ref: '#/components/schemas/Pitch'
 *       400:
 *         description: Validation failed, or pitch is not editable
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
  requireRole("business"),
  validate(updatePitchSchema),
  asyncHandler(pitchController.update)
);

/**
 * @openapi
 * /api/pitches/{id}/publish:
 *   post:
 *     tags: [Pitches]
 *     summary: Publish a draft pitch (draft → live)
 *     description: |
 *       Moves a pitch from `draft` to `live`. Enforces four rules:
 *
 *       1. Only the owner can publish.
 *       2. The pitch must be in `draft` status.
 *       3. The business profile must be complete (`users.isProfileComplete = true`).
 *       4. All required fields must be present on the pitch:
 *          `title`, `tagline`, `shortPitch`, `longSummary`,
 *          `askAmount`, `equityOffered`, `stage`, `revenueRange`.
 *
 *       Additionally, a business can have **only one live pitch at a time**.
 *       Publishing a second pitch while another is live returns 409.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Pitch published
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 pitch:
 *                   $ref: '#/components/schemas/Pitch'
 *       400:
 *         description: Pitch is incomplete or not in draft status
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not the owner
 *       404:
 *         description: Pitch not found
 *       409:
 *         description: Business already has a live pitch
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post(
  "/:id/publish",
  requireAuth,
  requireRole("business"),
  asyncHandler(pitchController.publish)
);

/**
 * @openapi
 * /api/pitches/{id}/close:
 *   post:
 *     tags: [Pitches]
 *     summary: Close a live pitch (live → closed)
 *     description: |
 *       Moves a pitch from `live` to `closed`. Sets `closedAt`. Only the
 *       owner can close. Once closed, a pitch cannot be edited or reopened.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Pitch closed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 pitch:
 *                   $ref: '#/components/schemas/Pitch'
 *       400:
 *         description: Pitch is not in live status
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not the owner
 *       404:
 *         description: Pitch not found
 */
router.post(
  "/:id/close",
  requireAuth,
  requireRole("business"),
  asyncHandler(pitchController.close)
);

/**
 * @openapi
 * /api/pitches/{id}:
 *   delete:
 *     tags: [Pitches]
 *     summary: Delete a draft pitch
 *     description: |
 *       Deletes a pitch. Only `draft` pitches can be deleted — live and
 *       closed pitches must be kept for history.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Pitch deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 deleted:
 *                   type: boolean
 *                   example: true
 *       400:
 *         description: Only draft pitches can be deleted
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not the owner
 *       404:
 *         description: Pitch not found
 */
router.delete(
  "/:id",
  requireAuth,
  requireRole("business"),
  asyncHandler(pitchController.remove)
);

export default router;