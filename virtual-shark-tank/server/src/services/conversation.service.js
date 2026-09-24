import { eq, or, and, desc, sql, ne, gt, inArray } from "drizzle-orm";
import { db } from "../config/db.postgres.js";
import {
  users,
  conversations,
  messages,
} from "../models/postgres/index.js";
import { ApiError } from "../utils/apiError.js";
import { checkNewConversationLimit } from "./message.service.js";

// ---------- Helpers ----------
const orderPair = (a, b) => (a < b ? [a, b] : [b, a]);

const assertMembership = (conversation, userId) => {
  if (
    conversation.participantAId !== userId &&
    conversation.participantBId !== userId
  ) {
    throw ApiError.forbidden("You are not a member of this conversation");
  }
};

// ---------- Get or create ----------
export const getOrCreateConversation = async (userAId, userBId) => {
  if (userAId === userBId) {
    throw ApiError.badRequest("Cannot start a conversation with yourself");
  }

  const [a, b] = orderPair(userAId, userBId);

  // Verify the other user exists and is active
  const other = await db.query.users.findFirst({
    where: eq(users.id, b === userAId ? a : b),
    columns: { id: true, isActive: true },
  });
  if (!other) throw ApiError.notFound("User not found");
  if (!other.isActive) throw ApiError.badRequest("Cannot message an inactive user");

  // Try to find existing
  const existing = await db.query.conversations.findFirst({
    where: and(
      eq(conversations.participantAId, a),
      eq(conversations.participantBId, b)
    ),
  });
  if (existing) return { conversation: existing, created: false };
  checkNewConversationLimit(userAId);
  

  // Create new
   const [created] = await db
    .insert(conversations)
    .values({
      participantAId: a,
      participantBId: b,
      lastMessageAt: sql`now()`,   // ← explicit, same clock as future updates
    })
    .returning();

  return { conversation: created, created: true };
  
};

// ---------- Get one ----------
export const getConversation = async (conversationId, userId) => {
  const conversation = await db.query.conversations.findFirst({
    where: eq(conversations.id, conversationId),
  });
  if (!conversation) throw ApiError.notFound("Conversation not found");

  assertMembership(conversation, userId);

  const otherUserId =
    conversation.participantAId === userId
      ? conversation.participantBId
      : conversation.participantAId;

  const other = await db.query.users.findFirst({
    where: eq(users.id, otherUserId),
    columns: {
      id: true,
      name: true,
      role: true,
      avatarUrl: true,
    },
  });

  return { ...conversation, otherUser: other };
};

// ---------- List my conversations ----------
export const listConversations = async (userId, { limit = 20, offset = 0 } = {}) => {
  // 1. Get my conversations, sorted by activity
  const rows = await db
    .select()
    .from(conversations)
    .where(
      or(
        eq(conversations.participantAId, userId),
        eq(conversations.participantBId, userId)
      )
    )
    .orderBy(desc(conversations.lastMessageAt))
    .limit(limit)
    .offset(offset);

  if (rows.length === 0) {
    return { conversations: [], pagination: { limit, offset, total: 0 } };
  }

  const conversationIds = rows.map((r) => r.id);
  const otherUserIds = [
    ...new Set(
      rows.map((r) =>
        r.participantAId === userId ? r.participantBId : r.participantAId
      )
    ),
  ];

  // 2. Fetch other users in one batch
  const otherUsers = await db
    .select({
      id: users.id,
      name: users.name,
      avatarUrl: users.avatarUrl,
    })
    .from(users)
    .where(inArray(users.id, otherUserIds));
  const userMap = new Map(otherUsers.map((u) => [u.id, u]));

  // 3. Fetch all messages for these conversations in one batch
  const allMessages = await db
    .select({
      id: messages.id,
      conversationId: messages.conversationId,
      body: messages.body,
      senderId: messages.senderId,
      isRead: messages.isRead,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(inArray(messages.conversationId, conversationIds))
    .orderBy(desc(messages.createdAt));

  // 4. Aggregate in JS
  const lastMessageMap = new Map();
  const unreadMap = new Map();

  for (const m of allMessages) {
    if (!lastMessageMap.has(m.conversationId)) {
      lastMessageMap.set(m.conversationId, m);
    }
    if (m.isRead === false && m.senderId !== userId) {
      unreadMap.set(m.conversationId, (unreadMap.get(m.conversationId) || 0) + 1);
    }
  }

  // 5. Total count for pagination
  const [totalRow] = await db
    .select({ count: sql`count(*)`.mapWith(Number) })
    .from(conversations)
    .where(
      or(
        eq(conversations.participantAId, userId),
        eq(conversations.participantBId, userId)
      )
    );

  return {
    conversations: rows.map((r) => {
      const otherId =
        r.participantAId === userId ? r.participantBId : r.participantAId;
      const lastMsg = lastMessageMap.get(r.id);
      return {
        id: r.id,
        lastMessageAt: r.lastMessageAt,
        createdAt: r.createdAt,
        otherUser: userMap.get(otherId) || null,
        lastMessage: lastMsg
          ? {
              body: lastMsg.body,
              senderId: lastMsg.senderId,
              sentByMe: lastMsg.senderId === userId,
            }
          : null,
        unreadCount: unreadMap.get(r.id) || 0,
      };
    }),
    pagination: { limit, offset, total: totalRow.count },
  };
};

// ---------- Unread total ----------
export const getTotalUnread = async (userId) => {
  const [row] = await db
    .select({ count: sql`count(*)`.mapWith(Number) })
    .from(messages)
    .innerJoin(
      conversations,
      eq(conversations.id, messages.conversationId)
    )
    .where(
      and(
        eq(messages.isRead, false),
        ne(messages.senderId, userId),
        or(
          eq(conversations.participantAId, userId),
          eq(conversations.participantBId, userId)
        )
      )
    );

  return { total: row.count };
};