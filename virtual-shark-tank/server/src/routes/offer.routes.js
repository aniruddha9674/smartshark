import { Router } from "express";
import * as offerController from "../controllers/offer.controller.js";
import { validate } from "../middleware/validate.middleware.js";
import {
  createOfferSchema,
  counterOfferSchema,
} from "../validators/offer.validator.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();
router.use(requireAuth);

/**
 * @openapi
 * /api/offers:
 *   post:
 *     tags: [Offers]
 *     summary: Create an offer on a live pitch (investor only)
 *     description: |
 *       Investor makes a formal offer on a live pitch. Enforces:
 *       - Pitch must be live (business owner is open to approaches)
 *       - Cannot offer on your own business
 *       - One pending offer per investor per pitch
 *       - Rate limit: 20 offers/day
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/OfferCreate' }
 *     responses:
 *       201:
 *         description: Offer created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 offer: { $ref: '#/components/schemas/Offer' }
 *       400:
 *         description: Pitch not live / self-offer / validation failed
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Pitch or business not found
 *       409:
 *         description: Already have a pending offer on this pitch
 *       429:
 *         description: Daily offer limit reached
 */
router.post("/", validate(createOfferSchema), asyncHandler(offerController.create));

/**
 * @openapi
 * /api/offers/me:
 *   get:
 *     tags: [Offers]
 *     summary: List offers I've made (investor)
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
 *         description: My sent offers
 */
router.get("/me", asyncHandler(offerController.getMine));

/**
 * @openapi
 * /api/offers/received:
 *   get:
 *     tags: [Offers]
 *     summary: List offers received on a business (business owner)
 *     description: Returns all offers on the given business. Requires ownership.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: businessId
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [pending, accepted, rejected, countered, withdrawn, expired] }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *       - in: query
 *         name: offset
 *         schema: { type: integer, default: 0 }
 *     responses:
 *       200:
 *         description: Received offers
 *       403:
 *         description: You do not own this business
 */
router.get("/received", asyncHandler(offerController.getReceived));

/**
 * @openapi
 * /api/offers/{id}:
 *   get:
 *     tags: [Offers]
 *     summary: Get one offer
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Offer
 *       403:
 *         description: Not a participant
 *       404:
 *         description: Offer not found
 */
router.get("/:id", asyncHandler(offerController.getOne));

/**
 * @openapi
 * /api/offers/{id}/thread:
 *   get:
 *     tags: [Offers]
 *     summary: Get the full counter thread for an offer
 *     description: Returns the entire chain of offers and counters, root first.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Counter chain
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 thread:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/Offer' }
 */
router.get("/:id/thread", asyncHandler(offerController.getThread));

/**
 * @openapi
 * /api/offers/{id}/counter:
 *   post:
 *     tags: [Offers]
 *     summary: Counter an offer
 *     description: |
 *       Either party can counter, but NOT the party who made the current offer.
 *       Max counter depth: 10. Parent offer becomes `countered`, new pending offer is created.
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
 *           schema: { $ref: '#/components/schemas/OfferCounter' }
 *     responses:
 *       201:
 *         description: Counter created
 *       400:
 *         description: Offer not pending / max depth / expired
 *       403:
 *         description: Cannot counter your own offer / not a participant
 *       404:
 *         description: Offer not found
 */
router.post(
  "/:id/counter",
  validate(counterOfferSchema),
  asyncHandler(offerController.counter)
);

/**
 * @openapi
 * /api/offers/{id}/accept:
 *   post:
 *     tags: [Offers]
 *     summary: Accept an offer (business owner only)
 *     description: |
 *       Atomic operation. Accepts the offer, auto-rejects sibling pending offers on
 *       the same pitch, funds the pitch, creates an investment, opens a conversation.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Offer accepted, investment created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 offer: { $ref: '#/components/schemas/Offer' }
 *                 investment: { $ref: '#/components/schemas/Investment' }
 *       400:
 *         description: Offer not pending / pitch not live / expired
 *       403:
 *         description: Not the business owner
 *       404:
 *         description: Offer not found
 */
router.post("/:id/accept", asyncHandler(offerController.accept));

/**
 * @openapi
 * /api/offers/{id}/reject:
 *   post:
 *     tags: [Offers]
 *     summary: Reject an offer (business owner only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Offer rejected
 *       400:
 *         description: Offer not pending
 *       403:
 *         description: Not the business owner
 *       404:
 *         description: Offer not found
 */
router.post("/:id/reject", asyncHandler(offerController.reject));

/**
 * @openapi
 * /api/offers/{id}/withdraw:
 *   post:
 *     tags: [Offers]
 *     summary: Withdraw an offer (original investor only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Offer withdrawn
 *       400:
 *         description: Offer not pending
 *       403:
 *         description: Not the original investor
 *       404:
 *         description: Offer not found
 */
router.post("/:id/withdraw", asyncHandler(offerController.withdraw));

export default router;