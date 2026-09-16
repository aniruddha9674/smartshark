import { describe, it, expect, beforeEach } from "vitest";
import { eq, and } from "drizzle-orm";
import { db } from "../../src/config/db.postgres.js";
import {
  users,
  conversations,
  messages,
  notifications,
} from "../../src/models/postgres/index.js";
import * as messageService from "../../src/services/message.service.js";
import * as conversationService from "../../src/services/conversation.service.js";
import { _resetAll as resetRateLimits } from "../../src/services/rateLimit.service.js";
import { ApiError } from "../../src/utils/apiError.js";

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

const setupPair = async () => {
  const a = await createUser({ name: "Alice" });
  const b = await createUser({ name: "Bob" });
  const { conversation } = await conversationService.getOrCreateConversation(
    a.id,
    b.id
  );
  return { a, b, conversation };
};

describe("message.service", () => {
  beforeEach(async () => {
    await db.delete(users);
    resetRateLimits();
  });

  describe("sendMessage", () => {
    it("creates a message", async () => {
      const { a, conversation } = await setupPair();
      const msg = await messageService.sendMessage(
        conversation.id,
        a.id,
        "Hello"
      );
      expect(msg.body).toBe("Hello");
      expect(msg.senderId).toBe(a.id);
      expect(msg.isRead).toBe(false);
    });

    it("updates conversation.lastMessageAt", async () => {
      const { a, conversation } = await setupPair();
      const before = conversation.lastMessageAt;
      await new Promise((r) => setTimeout(r, 20));

      await messageService.sendMessage(conversation.id, a.id, "Hi");

      const [updated] = await db
        .select()
        .from(conversations)
        .where(eq(conversations.id, conversation.id));
      expect(updated.lastMessageAt.getTime()).toBeGreaterThan(before.getTime());
    });

    it("creates a notification for the recipient", async () => {
      const { a, b, conversation } = await setupPair();
      await messageService.sendMessage(conversation.id, a.id, "Hi Bob");

      const notifs = await db.select().from(notifications);
      expect(notifs.length).toBe(1);
      expect(notifs[0].type).toBe("new_message");
      expect(notifs[0].userId).toBe(b.id);
      expect(notifs[0].actorId).toBe(a.id);
      expect(notifs[0].title).toMatch(/Alice/);
    });

    it("does not notify the sender", async () => {
      const { a, conversation } = await setupPair();
      await messageService.sendMessage(conversation.id, a.id, "Self message");

      const notifs = await db.select().from(notifications);
      const selfNotifs = notifs.filter((n) => n.userId === a.id);
      expect(selfNotifs.length).toBe(0);
    });

    it("rejects non-member", async () => {
      const { conversation } = await setupPair();
      const outsider = await createUser();
      await expect(
        messageService.sendMessage(conversation.id, outsider.id, "Sneaky")
      ).rejects.toThrow(ApiError);
    });

    it("throws 404 for nonexistent conversation", async () => {
      const a = await createUser();
      const fake = "00000000-0000-0000-0000-000000000000";
      await expect(
        messageService.sendMessage(fake, a.id, "Hello")
      ).rejects.toThrow(ApiError);
    });

    it("enforces daily message limit (500)", async () => {
      const { a, conversation } = await setupPair();
      // Simulate 500 sent
      for (let i = 0; i < 500; i++) {
        // We bypass actual DB writes to speed this up by just calling the limiter
        messageService.checkNewConversationLimit; // no-op to satisfy lint
      }
      // Actually enforce: hit the limiter 500 times via sendMessage is too slow.
      // Instead: directly call the internal limiter via a fresh send loop small
      // For this test we reduce the limit by using a fresh user with a small run:
      const { enforceLimit } = await import("../../src/services/rateLimit.service.js");
      for (let i = 0; i < 500; i++) enforceLimit(a.id, "send_message", 500);
      await expect(
        messageService.sendMessage(conversation.id, a.id, "501")
      ).rejects.toThrow(ApiError);
    });
  });

  describe("listMessages", () => {
    it("returns messages in ascending order", async () => {
      const { a, b, conversation } = await setupPair();
      await messageService.sendMessage(conversation.id, a.id, "First");
      await new Promise((r) => setTimeout(r, 10));
      await messageService.sendMessage(conversation.id, b.id, "Second");
      await new Promise((r) => setTimeout(r, 10));
      await messageService.sendMessage(conversation.id, a.id, "Third");

      const result = await messageService.listMessages(conversation.id, a.id);
      expect(result.messages.length).toBe(3);
      expect(result.messages[0].body).toBe("First");
      expect(result.messages[2].body).toBe("Third");
    });

    it("filters by since timestamp (incremental polling)", async () => {
      const { a, b, conversation } = await setupPair();
      await messageService.sendMessage(conversation.id, a.id, "Old");

      // Derive `since` from a real DB row, not JS time.
      // This keeps both sides on the same clock (PGlite's).
      const initial = await messageService.listMessages(conversation.id, a.id);
      const since = initial.messages[0].createdAt;

      await new Promise((r) => setTimeout(r, 30));
      await messageService.sendMessage(conversation.id, b.id, "New");

      const result = await messageService.listMessages(conversation.id, a.id, {
        since: since.toISOString(),
      });
      expect(result.messages.length).toBe(1);
      expect(result.messages[0].body).toBe("New");
    });

    it("respects limit", async () => {
      const { a, conversation } = await setupPair();
      for (let i = 0; i < 5; i++) {
        await messageService.sendMessage(conversation.id, a.id, `msg ${i}`);
      }
      const result = await messageService.listMessages(conversation.id, a.id, {
        limit: 2,
      });
      expect(result.messages.length).toBe(2);
      expect(result.pagination.total).toBe(5);
    });

    it("rejects non-member", async () => {
      const { conversation } = await setupPair();
      const outsider = await createUser();
      await expect(
        messageService.listMessages(conversation.id, outsider.id)
      ).rejects.toThrow(ApiError);
    });
  });

  describe("markConversationRead", () => {
    it("marks all unread messages from the other user as read", async () => {
      const { a, b, conversation } = await setupPair();
      await messageService.sendMessage(conversation.id, b.id, "1");
      await messageService.sendMessage(conversation.id, b.id, "2");

      const result = await messageService.markConversationRead(conversation.id, a.id);
      expect(result.markedRead).toBe(2);

      const rows = await db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, conversation.id));
      expect(rows.every((r) => r.isRead)).toBe(true);
    });

    it("does not mark my own messages as read", async () => {
      const { a, conversation } = await setupPair();
      await messageService.sendMessage(conversation.id, a.id, "mine");
      const result = await messageService.markConversationRead(conversation.id, a.id);
      expect(result.markedRead).toBe(0);
    });

    it("is idempotent", async () => {
      const { a, b, conversation } = await setupPair();
      await messageService.sendMessage(conversation.id, b.id, "hi");

      const first = await messageService.markConversationRead(conversation.id, a.id);
      const second = await messageService.markConversationRead(conversation.id, a.id);
      expect(first.markedRead).toBe(1);
      expect(second.markedRead).toBe(0);
    });

    it("rejects non-member", async () => {
      const { conversation } = await setupPair();
      const outsider = await createUser();
      await expect(
        messageService.markConversationRead(conversation.id, outsider.id)
      ).rejects.toThrow(ApiError);
    });
  });
});