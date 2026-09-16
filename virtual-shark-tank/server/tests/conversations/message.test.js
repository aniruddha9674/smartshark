import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../src/app.js";
import { db } from "../../src/config/db.postgres.js";
import { users, notifications } from "../../src/models/postgres/index.js";
import { _resetAll as resetRateLimits } from "../../src/services/rateLimit.service.js";

const registerUser = async (role = "investor") => {
  const email = `t-${Date.now()}-${Math.random()}@example.com`;
  const res = await request(app)
    .post("/api/auth/register")
    .send({ name: `User ${Math.random().toString(36).slice(2, 6)}`, email, password: "Password123", role })
    .expect(201);
  return { user: res.body.user, token: res.body.accessToken };
};

const setupConversation = async () => {
  const a = await registerUser();
  const b = await registerUser();
  const conv = await request(app)
    .post("/api/conversations")
    .set("Authorization", `Bearer ${a.token}`)
    .send({ userId: b.user.id })
    .expect(201);
  return { a, b, conversationId: conv.body.conversation.id };
};

describe("Message endpoints", () => {
  beforeEach(async () => {
    await db.delete(users);
    resetRateLimits();
  });

  describe("POST /api/conversations/:id/messages", () => {
    it("sends a message", async () => {
      const { a, conversationId } = await setupConversation();
      const res = await request(app)
        .post(`/api/conversations/${conversationId}/messages`)
        .set("Authorization", `Bearer ${a.token}`)
        .send({ body: "Hello" })
        .expect(201);
      expect(res.body.message.body).toBe("Hello");
    });

    it("rejects empty body", async () => {
      const { a, conversationId } = await setupConversation();
      await request(app)
        .post(`/api/conversations/${conversationId}/messages`)
        .set("Authorization", `Bearer ${a.token}`)
        .send({ body: "" })
        .expect(400);
    });

    it("rejects body over 5000 chars", async () => {
      const { a, conversationId } = await setupConversation();
      await request(app)
        .post(`/api/conversations/${conversationId}/messages`)
        .set("Authorization", `Bearer ${a.token}`)
        .send({ body: "x".repeat(5001) })
        .expect(400);
    });

    it("returns 403 for non-member", async () => {
      const { conversationId } = await setupConversation();
      const outsider = await registerUser();
      await request(app)
        .post(`/api/conversations/${conversationId}/messages`)
        .set("Authorization", `Bearer ${outsider.token}`)
        .send({ body: "Sneak" })
        .expect(403);
    });

    it("notifies the recipient", async () => {
      const { a, b, conversationId } = await setupConversation();
      await request(app)
        .post(`/api/conversations/${conversationId}/messages`)
        .set("Authorization", `Bearer ${a.token}`)
        .send({ body: "Hi Bob" })
        .expect(201);

      const notifs = await db.select().from(notifications);
      const toB = notifs.filter((n) => n.userId === b.user.id && n.type === "new_message");
      expect(toB.length).toBe(1);
    });
  });

  describe("GET /api/conversations/:id/messages", () => {
    it("returns messages in order", async () => {
      const { a, b, conversationId } = await setupConversation();
      await request(app)
        .post(`/api/conversations/${conversationId}/messages`)
        .set("Authorization", `Bearer ${a.token}`)
        .send({ body: "First" })
        .expect(201);
      await request(app)
        .post(`/api/conversations/${conversationId}/messages`)
        .set("Authorization", `Bearer ${b.token}`)
        .send({ body: "Second" })
        .expect(201);

      const res = await request(app)
        .get(`/api/conversations/${conversationId}/messages`)
        .set("Authorization", `Bearer ${a.token}`)
        .expect(200);

      expect(res.body.messages.length).toBe(2);
      expect(res.body.messages[0].body).toBe("First");
      expect(res.body.messages[1].body).toBe("Second");
    });

    it("supports since query param", async () => {
      const { a, b, conversationId } = await setupConversation();
      await request(app)
        .post(`/api/conversations/${conversationId}/messages`)
        .set("Authorization", `Bearer ${a.token}`)
        .send({ body: "Old" })
        .expect(201);

      const initial = await request(app)
        .get(`/api/conversations/${conversationId}/messages`)
        .set("Authorization", `Bearer ${a.token}`)
        .expect(200);
      const since = initial.body.messages[0].createdAt;

      await new Promise((r) => setTimeout(r, 20));

      await request(app)
        .post(`/api/conversations/${conversationId}/messages`)
        .set("Authorization", `Bearer ${b.token}`)
        .send({ body: "New" })
        .expect(201);

      const res = await request(app)
        .get(`/api/conversations/${conversationId}/messages?since=${encodeURIComponent(since)}`)
        .set("Authorization", `Bearer ${a.token}`)
        .expect(200);

      expect(res.body.messages.length).toBe(1);
      expect(res.body.messages[0].body).toBe("New");
    });

    it("returns 403 for non-member", async () => {
      const { conversationId } = await setupConversation();
      const outsider = await registerUser();
      await request(app)
        .get(`/api/conversations/${conversationId}/messages`)
        .set("Authorization", `Bearer ${outsider.token}`)
        .expect(403);
    });
  });

  describe("POST /api/conversations/:id/read", () => {
    it("marks unread messages as read", async () => {
      const { a, b, conversationId } = await setupConversation();
      await request(app)
        .post(`/api/conversations/${conversationId}/messages`)
        .set("Authorization", `Bearer ${b.token}`)
        .send({ body: "Hi A" })
        .expect(201);

      const res = await request(app)
        .post(`/api/conversations/${conversationId}/read`)
        .set("Authorization", `Bearer ${a.token}`)
        .expect(200);

      expect(res.body.markedRead).toBe(1);
    });

    it("is idempotent", async () => {
      const { a, b, conversationId } = await setupConversation();
      await request(app)
        .post(`/api/conversations/${conversationId}/messages`)
        .set("Authorization", `Bearer ${b.token}`)
        .send({ body: "Hi" })
        .expect(201);

      await request(app)
        .post(`/api/conversations/${conversationId}/read`)
        .set("Authorization", `Bearer ${a.token}`)
        .expect(200);

      const second = await request(app)
        .post(`/api/conversations/${conversationId}/read`)
        .set("Authorization", `Bearer ${a.token}`)
        .expect(200);

      expect(second.body.markedRead).toBe(0);
    });

    it("decrements the unread-count endpoint", async () => {
      const { a, b, conversationId } = await setupConversation();
      await request(app)
        .post(`/api/conversations/${conversationId}/messages`)
        .set("Authorization", `Bearer ${b.token}`)
        .send({ body: "Hi A" })
        .expect(201);

      const before = await request(app)
        .get("/api/conversations/unread-count")
        .set("Authorization", `Bearer ${a.token}`)
        .expect(200);
      expect(before.body.total).toBe(1);

      await request(app)
        .post(`/api/conversations/${conversationId}/read`)
        .set("Authorization", `Bearer ${a.token}`)
        .expect(200);

      const after = await request(app)
        .get("/api/conversations/unread-count")
        .set("Authorization", `Bearer ${a.token}`)
        .expect(200);
      expect(after.body.total).toBe(0);
    });
  });
});