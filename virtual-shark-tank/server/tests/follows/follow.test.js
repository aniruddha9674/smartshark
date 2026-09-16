import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../src/app.js";
import { db } from "../../src/config/db.postgres.js";
import {
  users,
  businessProfiles,
  investorProfiles,
  notifications,
} from "../../src/models/postgres/index.js";

const registerUser = async (role = "business") => {
  const email = `t-${role}-${Date.now()}-${Math.random()}@example.com`;
  const res = await request(app)
    .post("/api/auth/register")
    .send({ name: `Test ${role}`, email, password: "Password123", role })
    .expect(201);
  if (role === "business") {
    await db.insert(businessProfiles).values({ userId: res.body.user.id, companyName: "Acme" });
  } else {
    await db.insert(investorProfiles).values({ userId: res.body.user.id, firmName: "Peak" });
  }
  return { user: res.body.user, token: res.body.accessToken };
};

describe("Follow endpoints", () => {
  beforeEach(async () => {
    await db.delete(users);
  });

  // ---------- POST /:userId ----------
  describe("POST /api/follows/:userId", () => {
    it("follows a user", async () => {
      const a = await registerUser("investor");
      const b = await registerUser("business");

      const res = await request(app)
        .post(`/api/follows/${b.user.id}`)
        .set("Authorization", `Bearer ${a.token}`)
        .expect(201);

      expect(res.body.following).toBe(true);
      expect(res.body.alreadyFollowing).toBe(false);
    });

    it("is idempotent on duplicate follow", async () => {
      const a = await registerUser("investor");
      const b = await registerUser("business");

      await request(app)
        .post(`/api/follows/${b.user.id}`)
        .set("Authorization", `Bearer ${a.token}`)
        .expect(201);

      const res = await request(app)
        .post(`/api/follows/${b.user.id}`)
        .set("Authorization", `Bearer ${a.token}`)
        .expect(201);

      expect(res.body.alreadyFollowing).toBe(true);
    });

    it("rejects self-follow (400)", async () => {
      const a = await registerUser("investor");
      await request(app)
        .post(`/api/follows/${a.user.id}`)
        .set("Authorization", `Bearer ${a.token}`)
        .expect(400);
    });

    it("rejects following a nonexistent user (404)", async () => {
      const a = await registerUser("investor");
      const fake = "00000000-0000-0000-0000-000000000000";
      await request(app)
        .post(`/api/follows/${fake}`)
        .set("Authorization", `Bearer ${a.token}`)
        .expect(404);
    });

    it("rejects unauthenticated (401)", async () => {
      const a = await registerUser("investor");
      await request(app).post(`/api/follows/${a.user.id}`).expect(401);
    });

    it("creates a notification for the target", async () => {
      const a = await registerUser("investor");
      const b = await registerUser("business");

      await request(app)
        .post(`/api/follows/${b.user.id}`)
        .set("Authorization", `Bearer ${a.token}`)
        .expect(201);

      const notifs = await db.select().from(notifications);
      expect(notifs.length).toBe(1);
      expect(notifs[0].type).toBe("follow");
      expect(notifs[0].userId).toBe(b.user.id);
    });
  });

  // ---------- DELETE /:userId ----------
  describe("DELETE /api/follows/:userId", () => {
    it("unfollows a user", async () => {
      const a = await registerUser("investor");
      const b = await registerUser("business");

      await request(app)
        .post(`/api/follows/${b.user.id}`)
        .set("Authorization", `Bearer ${a.token}`)
        .expect(201);

      const res = await request(app)
        .delete(`/api/follows/${b.user.id}`)
        .set("Authorization", `Bearer ${a.token}`)
        .expect(200);

      expect(res.body.following).toBe(false);
      expect(res.body.wasFollowing).toBe(true);
    });

    it("is idempotent when not following", async () => {
      const a = await registerUser("investor");
      const b = await registerUser("business");

      const res = await request(app)
        .delete(`/api/follows/${b.user.id}`)
        .set("Authorization", `Bearer ${a.token}`)
        .expect(200);

      expect(res.body.wasFollowing).toBe(false);
    });
  });

  // ---------- GET /following ----------
  describe("GET /api/follows/following", () => {
    it("returns only my follows", async () => {
      const me = await registerUser("investor");
      const other = await registerUser("investor");
      const biz1 = await registerUser("business");
      const biz2 = await registerUser("business");

      // me follows biz1
      await request(app)
        .post(`/api/follows/${biz1.user.id}`)
        .set("Authorization", `Bearer ${me.token}`)
        .expect(201);

      // other follows biz2 (should not show up for me)
      await request(app)
        .post(`/api/follows/${biz2.user.id}`)
        .set("Authorization", `Bearer ${other.token}`)
        .expect(201);

      const res = await request(app)
        .get("/api/follows/following")
        .set("Authorization", `Bearer ${me.token}`)
        .expect(200);

      expect(res.body.users.length).toBe(1);
      expect(res.body.users[0].id).toBe(biz1.user.id);
      expect(res.body.pagination.total).toBe(1);
    });

    it("includes role-specific profile data", async () => {
      const me = await registerUser("investor");
      const biz = await registerUser("business");

      await request(app)
        .post(`/api/follows/${biz.user.id}`)
        .set("Authorization", `Bearer ${me.token}`)
        .expect(201);

      const res = await request(app)
        .get("/api/follows/following")
        .set("Authorization", `Bearer ${me.token}`)
        .expect(200);

      expect(res.body.users[0].profile.companyName).toBe("Acme");
    });

    it("respects limit", async () => {
      const me = await registerUser("investor");
      for (let i = 0; i < 3; i++) {
        const u = await registerUser("business");
        await request(app)
          .post(`/api/follows/${u.user.id}`)
          .set("Authorization", `Bearer ${me.token}`)
          .expect(201);
      }

      const res = await request(app)
        .get("/api/follows/following?limit=2")
        .set("Authorization", `Bearer ${me.token}`)
        .expect(200);

      expect(res.body.users.length).toBe(2);
      expect(res.body.pagination.total).toBe(3);
    });

    it("rejects invalid limit (400)", async () => {
      const me = await registerUser("investor");
      await request(app)
        .get("/api/follows/following?limit=500")
        .set("Authorization", `Bearer ${me.token}`)
        .expect(400);
    });

    it("returns empty when following nobody", async () => {
      const me = await registerUser("investor");
      const res = await request(app)
        .get("/api/follows/following")
        .set("Authorization", `Bearer ${me.token}`)
        .expect(200);
      expect(res.body.users).toEqual([]);
    });
  });

  // ---------- GET /followers ----------
  describe("GET /api/follows/followers", () => {
    it("returns only my followers", async () => {
      const me = await registerUser("business");
      const a = await registerUser("investor");
      const b = await registerUser("investor");

      await request(app)
        .post(`/api/follows/${me.user.id}`)
        .set("Authorization", `Bearer ${a.token}`)
        .expect(201);
      await request(app)
        .post(`/api/follows/${me.user.id}`)
        .set("Authorization", `Bearer ${b.token}`)
        .expect(201);

      const res = await request(app)
        .get("/api/follows/followers")
        .set("Authorization", `Bearer ${me.token}`)
        .expect(200);

      expect(res.body.users.length).toBe(2);
    });

    it("does not include users I follow but who don't follow back", async () => {
      const me = await registerUser("business");
      const other = await registerUser("investor");

      await request(app)
        .post(`/api/follows/${other.user.id}`)
        .set("Authorization", `Bearer ${me.token}`)
        .expect(201);

      const res = await request(app)
        .get("/api/follows/followers")
        .set("Authorization", `Bearer ${me.token}`)
        .expect(200);

      expect(res.body.users.length).toBe(0);
    });
  });

  // ---------- GET /status/:userId ----------
  describe("GET /api/follows/status/:userId", () => {
    it("returns following=true when following", async () => {
      const a = await registerUser("investor");
      const b = await registerUser("business");
      await request(app)
        .post(`/api/follows/${b.user.id}`)
        .set("Authorization", `Bearer ${a.token}`)
        .expect(201);

      const res = await request(app)
        .get(`/api/follows/status/${b.user.id}`)
        .set("Authorization", `Bearer ${a.token}`)
        .expect(200);
      expect(res.body.following).toBe(true);
    });

    it("returns following=false when not following", async () => {
      const a = await registerUser("investor");
      const b = await registerUser("business");
      const res = await request(app)
        .get(`/api/follows/status/${b.user.id}`)
        .set("Authorization", `Bearer ${a.token}`)
        .expect(200);
      expect(res.body.following).toBe(false);
    });
  });
});