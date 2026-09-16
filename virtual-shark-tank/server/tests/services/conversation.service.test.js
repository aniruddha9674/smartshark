import { describe, it, expect, beforeEach } from "vitest";
import { db } from "../../src/config/db.postgres.js";
import {
  users,
  conversations,
  messages,
} from "../../src/models/postgres/index.js";
import * as service from "../../src/services/conversation.service.js";
import { _resetAll as resetRateLimits } from "../../src/services/rateLimit.service.js";
import { ApiError } from "../../src/utils/apiError.js";
import { eq, sql } from "drizzle-orm";

const createUser = async (overrides = {}) => {
  const [user] = await db
    .insert(users)
    .values({
      name: `User ${Math.random().toString(36).slice(2, 7)}`,
      email: `u-${Date.now()}-${Math.random()}@example.com`,
      passwordHash: "$2b$12$fake",
      role: "investor",
      ...overrides,
    })
    .returning();
  return user;
};

describe("conversation.service", () => {
  beforeEach(async () => {
    await db.delete(users);
    resetRateLimits();
  });

  describe("getOrCreateConversation", () => {
    it("creates a new conversation between two users", async () => {
      const a = await createUser();
      const b = await createUser();
      const { conversation, created } = await service.getOrCreateConversation(
        a.id,
        b.id
      );
      expect(created).toBe(true);
      expect(conversation.participantAId).toBeDefined();
      expect(conversation.participantBId).toBeDefined();
    });

    it("orders participants (lower UUID first)", async () => {
      const a = await createUser();
      const b = await createUser();
      const { conversation } = await service.getOrCreateConversation(a.id, b.id);
      expect(conversation.participantAId < conversation.participantBId).toBe(true);
    });

    it("returns existing conversation on second call", async () => {
      const a = await createUser();
      const b = await createUser();
      const first = await service.getOrCreateConversation(a.id, b.id);
      const second = await service.getOrCreateConversation(a.id, b.id);
      expect(second.created).toBe(false);
      expect(second.conversation.id).toBe(first.conversation.id);
    });

    it("is order-independent (A→B and B→A return same conversation)", async () => {
      const a = await createUser();
      const b = await createUser();
      const ab = await service.getOrCreateConversation(a.id, b.id);
      const ba = await service.getOrCreateConversation(b.id, a.id);
      expect(ba.conversation.id).toBe(ab.conversation.id);
    });

    it("rejects self-conversation", async () => {
      const a = await createUser();
      await expect(
        service.getOrCreateConversation(a.id, a.id)
      ).rejects.toThrow(ApiError);
    });

    it("rejects conversation with nonexistent user", async () => {
      const a = await createUser();
      const fake = "00000000-0000-0000-0000-000000000000";
      await expect(
        service.getOrCreateConversation(a.id, fake)
      ).rejects.toThrow(ApiError);
    });

    it("rejects conversation with inactive user", async () => {
      const a = await createUser();
      const b = await createUser({ isActive: false });
      await expect(
        service.getOrCreateConversation(a.id, b.id)
      ).rejects.toThrow(ApiError);
    });
  });

  describe("getConversation", () => {
    it("returns conversation with otherUser data", async () => {
      const a = await createUser({ name: "Alice" });
      const b = await createUser({ name: "Bob" });
      const { conversation } = await service.getOrCreateConversation(a.id, b.id);

      const result = await service.getConversation(conversation.id, a.id);
      expect(result.otherUser.name).toBe("Bob");
    });

    it("throws 403 for non-member", async () => {
      const a = await createUser();
      const b = await createUser();
      const outsider = await createUser();
      const { conversation } = await service.getOrCreateConversation(a.id, b.id);

      await expect(
        service.getConversation(conversation.id, outsider.id)
      ).rejects.toThrow(ApiError);
    });

    it("throws 404 for nonexistent conversation", async () => {
      const a = await createUser();
      const fake = "00000000-0000-0000-0000-000000000000";
      await expect(service.getConversation(fake, a.id)).rejects.toThrow(ApiError);
    });
  });

  describe("listConversations", () => {
    it("returns empty when user has no conversations", async () => {
      const a = await createUser();
      const result = await service.listConversations(a.id);
      expect(result.conversations).toEqual([]);
    });

    it("returns only my conversations", async () => {
      const me = await createUser();
      const other = await createUser();
      const third = await createUser();

      await service.getOrCreateConversation(me.id, other.id);
      await service.getOrCreateConversation(other.id, third.id); // not mine

      const result = await service.listConversations(me.id);
      expect(result.conversations.length).toBe(1);
    });

    it("includes otherUser and lastMessage", async () => {
      const me = await createUser({ name: "Me" });
      const them = await createUser({ name: "Them" });
      const { conversation } = await service.getOrCreateConversation(me.id, them.id);

      // Insert a message directly (bypassing service)
      await db.insert(messages).values({
        conversationId: conversation.id,
        senderId: them.id,
        body: "Hello there",
      });
              await db
        .update(conversations)
        .set({ lastMessageAt: sql`now()` })
        .where(eq(conversations.id, conversation.id));

      const result = await service.listConversations(me.id);
      const c = result.conversations[0];
      expect(c.otherUser.name).toBe("Them");
      expect(c.lastMessage.body).toBe("Hello there");
      expect(c.lastMessage.sentByMe).toBe(false);
    });

    it("computes unread count (excludes own messages)", async () => {
      const me = await createUser();
      const them = await createUser();
      const { conversation } = await service.getOrCreateConversation(me.id, them.id);

      await db.insert(messages).values([
        { conversationId: conversation.id, senderId: them.id, body: "1" },
        { conversationId: conversation.id, senderId: them.id, body: "2" },
        { conversationId: conversation.id, senderId: me.id, body: "3" }, // my own
      ]);

      const result = await service.listConversations(me.id);
      expect(result.conversations[0].unreadCount).toBe(2);
    });

    it("respects limit", async () => {
      const me = await createUser();
      for (let i = 0; i < 3; i++) {
        const other = await createUser();
        await service.getOrCreateConversation(me.id, other.id);
      }
      const result = await service.listConversations(me.id, { limit: 2 });
      expect(result.conversations.length).toBe(2);
      expect(result.pagination.total).toBe(3);
    });
  });

  describe("getTotalUnread", () => {
    it("returns 0 when no unread messages", async () => {
      const me = await createUser();
      const result = await service.getTotalUnread(me.id);
      expect(result.total).toBe(0);
    });

    it("counts unread messages across all conversations", async () => {
      const me = await createUser();
      const a = await createUser();
      const b = await createUser();

      const c1 = await service.getOrCreateConversation(me.id, a.id);
      const c2 = await service.getOrCreateConversation(me.id, b.id);

      await db.insert(messages).values([
        { conversationId: c1.conversation.id, senderId: a.id, body: "hi 1" },
        { conversationId: c2.conversation.id, senderId: b.id, body: "hi 2" },
      ]);

      const result = await service.getTotalUnread(me.id);
      expect(result.total).toBe(2);
    });

    it("excludes my own messages", async () => {
      const me = await createUser();
      const them = await createUser();
      const { conversation } = await service.getOrCreateConversation(me.id, them.id);

      await db.insert(messages).values({
        conversationId: conversation.id,
        senderId: me.id,
        body: "my own",
      });

      const result = await service.getTotalUnread(me.id);
      expect(result.total).toBe(0);
    });
  });
});