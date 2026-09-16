import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../src/app.js";
import { db } from "../../src/config/db.postgres.js";
import { users } from "../../src/models/postgres/index.js";
import { _resetAll as resetRateLimits } from "../../src/services/rateLimit.service.js";

const registerUser = async (role = "investor") => {
  const email = `t-${Date.now()}-${Math.random()}@example.com`;
  const res = await request(app)
    .post("/api/auth/register")
    .send({ name: `User ${Math.random().toString(36).slice(2, 6)}`, email, password: "Password123", role })
    .expect(201);
  return { user: res.body.user, token: res.body.accessToken };
};

describe("Conversation endpoints", () => {
  beforeEach(async () => {
    await db.delete(users);
    resetRateLimits();
  });

  describe("POST /api/conversations", () => {
    it("creates a new conversation (201)", async () => {
      const a = await registerUser();
      const b = await registerUser();

      const res = await request(app)
        .post("/api/conversations")
        .set("Authorization", `Bearer ${a.token}`)
        .send({ userId: b.user.id })
        .expect(201);

      expect(res.body.conversation.id).toBeDefined();
    });

    it("returns existing conversation with 200", async () => {
      const a = await registerUser();
      const b = await registerUser();

      await request(app)
        .post("/api/conversations")
        .set("Authorization", `Bearer ${a.token}`)
        .send({ userId: b.user.id })
        .expect(201);

      await request(app)
        .post("/api/conversations")
        .set("Authorization", `Bearer ${a.token}`)
        .send({ userId: b.user.id })
        .expect(200);
    });

    it("returns 400 for self-conversation", async () => {
      const a = await registerUser();
      await request(app)
        .post("/api/conversations")
        .set("Authorization", `Bearer ${a.token}`)
        .send({ userId: a.user.id })
        .expect(400);
    });

    it("returns 401 without auth", async () => {
      const b = await registerUser();
      await request(app)
        .post("/api/conversations")
        .send({ userId: b.user.id })
        .expect(401);
    });

    it("returns 400 for invalid userId format", async () => {
      const a = await registerUser();
      await request(app)
        .post("/api/conversations")
        .set("Authorization", `Bearer ${a.token}`)
        .send({ userId: "not-a-uuid" })
        .expect(400);
    });
  });

  describe("GET /api/conversations", () => {
    it("returns empty when no conversations", async () => {
      const a = await registerUser();
      const res = await request(app)
        .get("/api/conversations")
        .set("Authorization", `Bearer ${a.token}`)
        .expect(200);
      expect(res.body.conversations).toEqual([]);
    });

    it("returns only my conversations", async () => {
      const me = await registerUser();
      const other = await registerUser();
      const third = await registerUser();

      await request(app)
        .post("/api/conversations")
        .set("Authorization", `Bearer ${me.token}`)
        .send({ userId: other.user.id })
        .expect(201);

      await request(app)
        .post("/api/conversations")
        .set("Authorization", `Bearer ${other.token}`)
        .send({ userId: third.user.id })
        .expect(201);

      const res = await request(app)
        .get("/api/conversations")
        .set("Authorization", `Bearer ${me.token}`)
        .expect(200);

      expect(res.body.conversations.length).toBe(1);
    });
  });

  describe("GET /api/conversations/unread-count", () => {
    it("returns 0 when no unread", async () => {
      const a = await registerUser();
      const res = await request(app)
        .get("/api/conversations/unread-count")
        .set("Authorization", `Bearer ${a.token}`)
        .expect(200);
      expect(res.body.total).toBe(0);
    });
  });

  describe("GET /api/conversations/:id", () => {
    it("returns conversation with otherUser", async () => {
      const a = await registerUser();
      const b = await registerUser();

      const created = await request(app)
        .post("/api/conversations")
        .set("Authorization", `Bearer ${a.token}`)
        .send({ userId: b.user.id })
        .expect(201);

      const res = await request(app)
        .get(`/api/conversations/${created.body.conversation.id}`)
        .set("Authorization", `Bearer ${a.token}`)
        .expect(200);

      expect(res.body.conversation.otherUser.id).toBe(b.user.id);
    });

    it("returns 403 for non-member", async () => {
      const a = await registerUser();
      const b = await registerUser();
      const outsider = await registerUser();

      const created = await request(app)
        .post("/api/conversations")
        .set("Authorization", `Bearer ${a.token}`)
        .send({ userId: b.user.id })
        .expect(201);

      await request(app)
        .get(`/api/conversations/${created.body.conversation.id}`)
        .set("Authorization", `Bearer ${outsider.token}`)
        .expect(403);
    });
  });
});