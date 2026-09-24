import { Router } from "express";
import * as investmentController from "../controllers/investment.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();
router.use(requireAuth);

/**
 * @openapi
 * /api/investments/me:
 *   get:
 *     tags: [Investments]
 *     summary: My portfolio (as an investor)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: My investments
 */
router.get("/me", asyncHandler(investmentController.getMine));

/**
 * @openapi
 * /api/investments/summary:
 *   get:
 *     tags: [Investments]
 *     summary: Portfolio aggregate stats
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Summary
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalInvested: { type: string, example: "5000000" }
 *                 investmentCount: { type: integer, example: 8 }
 *                 byStatus: { type: object }
 *                 bySector: { type: object }
 */
router.get("/summary", asyncHandler(investmentController.getSummary));

/**
 * @openapi
 * /api/investments/received:
 *   get:
 *     tags: [Investments]
 *     summary: Funding received by a business (business owner)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: businessId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Received investments
 *       403:
 *         description: You do not own this business
 */
router.get("/received", asyncHandler(investmentController.getReceived));

/**
 * @openapi
 * /api/investments/{id}:
 *   get:
 *     tags: [Investments]
 *     summary: Get one investment
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Investment
 *       403:
 *         description: Not a participant
 *       404:
 *         description: Not found
 */
router.get("/:id", asyncHandler(investmentController.getOne));

export default router;