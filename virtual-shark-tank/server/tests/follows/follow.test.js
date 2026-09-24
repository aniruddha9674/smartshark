import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../src/app.js";
import { db } from "../../src/config/db.postgres.js";
import { users } from "../../src/models/postgres/index.js";

const registerUser = async () => {
  const email = `t-${Date.now()}-${Math.random()}@example.com`;
  const res = await request(app)
    .post("/api/auth/register")
    .send({ name: `User ${Math.random().toString(36).slice(2, 6)}`, email, password: "Password123" })
    .expect(201);
  return { user: res.body.user, token: res.body.accessToken };
};

const createBusiness = async (token, data = {}) => {
  const res = await request(app)
    .post("/api/businesses")
    .set("Authorization", `Bearer ${token}`)
    .send({ companyName: "Acme", ...data })
    .expect(201);
  return res.body.business;
};

const createInvestor = async () => {
  const { user, token } = await registerUser();
  await request(app)
    .post("/api/investor/me")
    .set("Authorization", `Bearer ${token}`)
    .expect(201);
  return { user, token };
};

describe("Follow endpoints", () => {
  beforeEach(async () => {
    await db.delete(users);
  });

  describe("POST /api/follows/business/:id", () => {
    it("follows a business", async () => {
      const follower = await registerUser();
      const owner = await registerUser();
      const biz = await createBusiness(owner.token);

      const res = await request(app)
        .post(`/api/follows/business/${biz.id}`)
        .set("Authorization", `Bearer ${follower.token}`)
        .expect(201);
      expect(res.body.following).toBe(true);
    });

    it("is idempotent", async () => {
      const follower = await registerUser();
      const owner = await registerUser();
      const biz = await createBusiness(owner.token);

      await request(app)
        .post(`/api/follows/business/${biz.id}`)
        .set("Authorization", `Bearer ${follower.token}`)
        .expect(201);

      const res = await request(app)
        .post(`/api/follows/business/${biz.id}`)
        .set("Authorization", `Bearer ${follower.token}`)
        .expect(201);
      expect(res.body.alreadyFollowing).toBe(true);
    });

    it("400 for following your own business", async () => {
      const owner = await registerUser();
      const biz = await createBusiness(owner.token);

      await request(app)
        .post(`/api/follows/business/${biz.id}`)
        .set("Authorization", `Bearer ${owner.token}`)
        .expect(400);
    });

    it("404 for nonexistent business", async () => {
      const follower = await registerUser();
      const fake = "00000000-0000-0000-0000-000000000000";

      await request(app)
        .post(`/api/follows/business/${fake}`)
        .set("Authorization", `Bearer ${follower.token}`)
        .expect(404);
    });

    it("401 without auth", async () => {
      const owner = await registerUser();
      const biz = await createBusiness(owner.token);
      await request(app).post(`/api/follows/business/${biz.id}`).expect(401);
    });
  });

  describe("DELETE /api/follows/business/:id", () => {
    it("unfollows a business", async () => {
      const follower = await registerUser();
      const owner = await registerUser();
      const biz = await createBusiness(owner.token);

      await request(app)
        .post(`/api/follows/business/${biz.id}`)
        .set("Authorization", `Bearer ${follower.token}`)
        .expect(201);

      const res = await request(app)
        .delete(`/api/follows/business/${biz.id}`)
        .set("Authorization", `Bearer ${follower.token}`)
        .expect(200);
      expect(res.body.wasFollowing).toBe(true);
    });

    it("idempotent when not following", async () => {
      const follower = await registerUser();
      const owner = await registerUser();
      const biz = await createBusiness(owner.token);

      const res = await request(app)
        .delete(`/api/follows/business/${biz.id}`)
        .set("Authorization", `Bearer ${follower.token}`)
        .expect(200);
      expect(res.body.wasFollowing).toBe(false);
    });
  });

  describe("POST /api/follows/investor/:id", () => {
    it("follows an investor", async () => {
      const follower = await registerUser();
      const investor = await createInvestor();

      const res = await request(app)
        .post(`/api/follows/investor/${investor.user.id}`)
        .set("Authorization", `Bearer ${follower.token}`)
        .expect(201);
      expect(res.body.following).toBe(true);
    });

    it("400 for following yourself", async () => {
      const investor = await createInvestor();
      await request(app)
        .post(`/api/follows/investor/${investor.user.id}`)
        .set("Authorization", `Bearer ${investor.token}`)
        .expect(400);
    });

    it("400 when target has no investor profile", async () => {
      const follower = await registerUser();
      const regular = await registerUser();

      await request(app)
        .post(`/api/follows/investor/${regular.user.id}`)
        .set("Authorization", `Bearer ${follower.token}`)
        .expect(400);
    });
  });

  describe("GET /api/follows/following", () => {
    it("returns businesses and investors I follow", async () => {
      const me = await registerUser();
      const owner = await registerUser();
      const biz = await createBusiness(owner.token);
      const investor = await createInvestor();

      await request(app)
        .post(`/api/follows/business/${biz.id}`)
        .set("Authorization", `Bearer ${me.token}`)
        .expect(201);
      await request(app)
        .post(`/api/follows/investor/${investor.user.id}`)
        .set("Authorization", `Bearer ${me.token}`)
        .expect(201);

      const res = await request(app)
        .get("/api/follows/following")
        .set("Authorization", `Bearer ${me.token}`)
        .expect(200);

      expect(res.body.following.length).toBe(2);
      const types = res.body.following.map((f) => f.type).sort();
      expect(types).toEqual(["business", "investor"]);
    });

    it("empty when following nobody", async () => {
      const me = await registerUser();
      const res = await request(app)
        .get("/api/follows/following")
        .set("Authorization", `Bearer ${me.token}`)
        .expect(200);
      expect(res.body.following).toEqual([]);
    });
  });

  describe("GET /api/follows/business/:id/followers", () => {
    it("owner sees their business's followers", async () => {
      const owner = await registerUser();
      const biz = await createBusiness(owner.token);
      const f1 = await registerUser();
      const f2 = await registerUser();

      await request(app)
        .post(`/api/follows/business/${biz.id}`)
        .set("Authorization", `Bearer ${f1.token}`)
        .expect(201);
      await request(app)
        .post(`/api/follows/business/${biz.id}`)
        .set("Authorization", `Bearer ${f2.token}`)
        .expect(201);

      const res = await request(app)
        .get(`/api/follows/business/${biz.id}/followers`)
        .set("Authorization", `Bearer ${owner.token}`)
        .expect(200);

      expect(res.body.followers.length).toBe(2);
    });

    it("403 for non-owner", async () => {
      const owner = await registerUser();
      const attacker = await registerUser();
      const biz = await createBusiness(owner.token);

      await request(app)
        .get(`/api/follows/business/${biz.id}/followers`)
        .set("Authorization", `Bearer ${attacker.token}`)
        .expect(403);
    });
  });

  describe("GET /api/follows/investor/followers", () => {
    it("returns my followers as an investor", async () => {
      const investor = await createInvestor();
      const f1 = await registerUser();

      await request(app)
        .post(`/api/follows/investor/${investor.user.id}`)
        .set("Authorization", `Bearer ${f1.token}`)
        .expect(201);

      const res = await request(app)
        .get("/api/follows/investor/followers")
        .set("Authorization", `Bearer ${investor.token}`)
        .expect(200);

      expect(res.body.followers.length).toBe(1);
    });
  });

  describe("GET /api/follows/status/business/:id", () => {
    it("true when following", async () => {
      const follower = await registerUser();
      const owner = await registerUser();
      const biz = await createBusiness(owner.token);

      await request(app)
        .post(`/api/follows/business/${biz.id}`)
        .set("Authorization", `Bearer ${follower.token}`)
        .expect(201);

      const res = await request(app)
        .get(`/api/follows/status/business/${biz.id}`)
        .set("Authorization", `Bearer ${follower.token}`)
        .expect(200);
      expect(res.body.following).toBe(true);
    });

    it("false when not following", async () => {
      const me = await registerUser();
      const owner = await registerUser();
      const biz = await createBusiness(owner.token);

      const res = await request(app)
        .get(`/api/follows/status/business/${biz.id}`)
        .set("Authorization", `Bearer ${me.token}`)
        .expect(200);
      expect(res.body.following).toBe(false);
    });
  });

  describe("GET /api/follows/status/investor/:id", () => {
    it("true when following an investor", async () => {
      const follower = await registerUser();
      const investor = await createInvestor();

      await request(app)
        .post(`/api/follows/investor/${investor.user.id}`)
        .set("Authorization", `Bearer ${follower.token}`)
        .expect(201);

      const res = await request(app)
        .get(`/api/follows/status/investor/${investor.user.id}`)
        .set("Authorization", `Bearer ${follower.token}`)
        .expect(200);
      expect(res.body.following).toBe(true);
    });
  });
});