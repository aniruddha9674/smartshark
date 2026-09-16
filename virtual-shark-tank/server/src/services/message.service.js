import { eq, and, ne, asc, desc, gt, sql, inArray } from "drizzle-orm";
import { db } from "../config/db.postgres.js";
import {
  users,
  conversations,
  messages,
} from "../models/postgres/index.js";
import { ApiError } from "../utils/apiError.js";
import { createNotification } from "./notification.service.js";
import { enforceLimit } from "./rateLimit.service.js";

// Rate limits
const MESSAGES_PER_DAY = 500;
const NEW_CONVERSATIONS_PER_DAY = 50;

// ---------- Helpers ----------
const assertMembership = (conversation, userId) => {
  if (
    conversation.participantAId !== userId &&
    conversation.participantBId !== userId
  ) {
    throw ApiError.forbidden("You are not a member of this conversation");
  }
};

const otherParticipant = (conversation, userId) =>
  conversation.participantAId === userId
    ? conversation.participantBId
    : conversation.participantAId;

// ---------- Send ----------
export const sendMessage = async (conversationId, senderId, body) => {
  const conversation = await db.query.conversations.findFirst({
    where: eq(conversations.id, conversationId),
  });
  if (!conversation) throw ApiError.notFound("Conversation not found");

  assertMembership(conversation, senderId);

  // Rate limit
  enforceLimit(senderId, "send_message", MESSAGES_PER_DAY);

  

  // Transaction: message + conversation.lastMessageAt must succeed together
  const message = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(messages)
      .values({ conversationId, senderId, body })
      .returning();

    await tx
      .update(conversations)
      .set({ lastMessageAt: sql`now()` })
      .where(eq(conversations.id, conversationId));

    return inserted;
  });

  // Fire notification (best-effort — never blocks the send)
  const recipientId = otherParticipant(conversation, senderId);
  const sender = await db.query.users.findFirst({
    where: eq(users.id, senderId),
    columns: { name: true },
  });
  await createNotification({
    userId: recipientId,
    actorId: senderId,
    type: "new_message",
    title: `New message from ${sender.name}`,
    body: body.slice(0, 100),
    metadata: { conversationId, messageId: message.id },
  });

  return message;
};

// ---------- List ----------
export const listMessages = async (
  conversationId,
  userId,
  { since, limit = 50, offset = 0 } = {}
) => {
  const conversation = await db.query.conversations.findFirst({
    where: eq(conversations.id, conversationId),
  });
  if (!conversation) throw ApiError.notFound("Conversation not found");

  assertMembership(conversation, userId);

  const conditions = [eq(messages.conversationId, conversationId)];
  if (since) {
    conditions.push(gt(messages.createdAt, new Date(since)));
  }

  const rows = await db
    .select()
    .from(messages)
    .where(and(...conditions))
    .orderBy(asc(messages.createdAt))
    .limit(limit)
    .offset(offset);

  const total = await db
    .select({ count: sql`count(*)`.mapWith(Number) })
    .from(messages)
    .where(eq(messages.conversationId, conversationId));

  return {
    messages: rows,
    pagination: { limit, offset, total: total[0].count },
  };
};

// ---------- Mark whole thread read ----------
export const markConversationRead = async (conversationId, userId) => {
  const conversation = await db.query.conversations.findFirst({
    where: eq(conversations.id, conversationId),
  });
  if (!conversation) throw ApiError.notFound("Conversation not found");

  assertMembership(conversation, userId);

   const result = await db
    .update(messages)
    .set({ isRead: true, readAt: sql`now()` })
    .where(
      and(
        eq(messages.conversationId, conversationId),
        eq(messages.isRead, false),
        ne(messages.senderId, userId)
      )
    )
    .returning({ id: messages.id });

  return { markedRead: result.length };
};

// ---------- Rate limit gate for new conversations ----------
// Called from conversation.service before creating a new thread.
export const checkNewConversationLimit = (userId) => {
  return enforceLimit(userId, "new_conversation", NEW_CONVERSATIONS_PER_DAY);
};

// ---------- Constants (exported for tests / docs) ----------
export const RATE_LIMITS = {
  messagesPerDay: MESSAGES_PER_DAY,
  newConversationsPerDay: NEW_CONVERSATIONS_PER_DAY,
};