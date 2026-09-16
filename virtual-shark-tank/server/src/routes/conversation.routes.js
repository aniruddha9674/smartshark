import { Router } from "express";
import * as conversationController from "../controllers/conversation.controller.js";
import * as messageController from "../controllers/message.controller.js";
import { validate } from "../middleware/validate.middleware.js";
import {
  startConversationSchema,
  sendMessageSchema,
  listMessagesQuerySchema,
  listConversationsQuerySchema,
} from "../validators/conversation.validator.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

router.use(requireAuth);

/**
 * @openapi
 * /api/conversations/unread-count:
 *   get:
 *     tags: [Conversations]
 *     summary: Total unread message count
 *     description: Returns the total number of unread messages across all of the user's conversations. Powers the notification badge.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Unread count
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total: { type: integer, example: 5 }
 *       401:
 *         description: Not authenticated
 */
router.get(
  "/unread-count",
  asyncHandler(conversationController.getUnread)
);

/**
 * @openapi
 * /api/conversations:
 *   get:
 *     tags: [Conversations]
 *     summary: List my conversations
 *     description: Returns the authenticated user's conversations, sorted by most recent activity (lastMessageAt DESC). Each entry includes the other participant, the last message, and an unread count.
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
 *         description: Paginated list of conversations
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 conversations:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/ConversationSummary'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 *       401:
 *         description: Not authenticated
 */
router.get(
  "/",
  validate(listConversationsQuerySchema, "query"),
  asyncHandler(conversationController.list)
);

/**
 * @openapi
 * /api/conversations:
 *   post:
 *     tags: [Conversations]
 *     summary: Start or fetch a conversation with a user
 *     description: |
 *       Idempotent — if a conversation already exists between the two users,
 *       returns it with 200. Otherwise creates a new one and returns 201.
 *
 *       Cannot start a conversation with yourself (400).
 *       Rate limit: 50 new conversations per day per user (429 on overflow).
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId]
 *             properties:
 *               userId: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Existing conversation returned
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 conversation: { $ref: '#/components/schemas/Conversation' }
 *       201:
 *         description: New conversation created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 conversation: { $ref: '#/components/schemas/Conversation' }
 *       400:
 *         description: Cannot start a conversation with yourself
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Target user not found
 *       429:
 *         description: Daily new-conversation limit reached
 */
router.post(
  "/",
  validate(startConversationSchema),
  asyncHandler(conversationController.start)
);

/**
 * @openapi
 * /api/conversations/{id}:
 *   get:
 *     tags: [Conversations]
 *     summary: Get one conversation
 *     description: Returns a conversation's metadata plus the other participant's info. Members only (403 otherwise).
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Conversation with otherUser
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 conversation: { $ref: '#/components/schemas/ConversationWithUser' }
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not a member of this conversation
 *       404:
 *         description: Conversation not found
 */
router.get(
  "/:id",
  asyncHandler(conversationController.getOne)
);

/**
 * @openapi
 * /api/conversations/{id}/messages:
 *   get:
 *     tags: [Conversations]
 *     summary: List messages in a conversation
 *     description: |
 *       Returns messages in ascending chronological order. Supports incremental
 *       polling via the `since` parameter — pass the `createdAt` of the last
 *       message you received and only newer messages are returned.
 *
 *       Recommended polling interval: 2 seconds when the chat window is open.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: since
 *         schema: { type: string, format: date-time }
 *         description: ISO 8601 timestamp — only return messages after this
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50, maximum: 100 }
 *       - in: query
 *         name: offset
 *         schema: { type: integer, default: 0 }
 *     responses:
 *       200:
 *         description: Message list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 messages:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/Message' }
 *                 pagination: { $ref: '#/components/schemas/Pagination' }
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not a member
 *       404:
 *         description: Conversation not found
 */
router.get(
  "/:id/messages",
  validate(listMessagesQuerySchema, "query"),
  asyncHandler(messageController.list)
);

/**
 * @openapi
 * /api/conversations/{id}/messages:
 *   post:
 *     tags: [Conversations]
 *     summary: Send a message
 *     description: |
 *       Sends a message in a conversation. Creates a `new_message`
 *       notification for the recipient (respects their preference).
 *
 *       Rate limit: 500 messages per day per user (429 on overflow).
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
 *             required: [body]
 *             properties:
 *               body: { type: string, minLength: 1, maxLength: 5000 }
 *     responses:
 *       201:
 *         description: Message created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { $ref: '#/components/schemas/Message' }
 *       400:
 *         description: Validation failed
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not a member
 *       404:
 *         description: Conversation not found
 *       429:
 *         description: Daily message limit reached
 */
router.post(
  "/:id/messages",
  validate(sendMessageSchema),
  asyncHandler(messageController.send)
);

/**
 * @openapi
 * /api/conversations/{id}/read:
 *   post:
 *     tags: [Conversations]
 *     summary: Mark a conversation as read
 *     description: |
 *       Marks all unread messages from the other participant as read
 *       (sets `isRead=true`, `readAt=now()`). Idempotent — calling twice
 *       returns `markedRead: 0` the second time.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Count of messages marked read
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 markedRead: { type: integer, example: 3 }
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not a member
 *       404:
 *         description: Conversation not found
 */
router.post(
  "/:id/read",
  asyncHandler(messageController.markRead)
);

export default router;