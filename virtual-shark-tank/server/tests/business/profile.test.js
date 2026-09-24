import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../src/app.js";
import { db } from "../../src/config/db.postgres.js";
import { users } from "../../src/models/postgres/index.js";

const registerUser = async () => {
  const email = `t-${Date.now()}-${Math.random()}@example.com`;
  const res = await request(app)
    .post("/api/auth/register")
    .send({ name: "Test User", email, password: "Password123" })
    .expect(201);
  return { user: res.body.user, token: res.body.accessToken };
};

const createBusiness = async (token, data = {}) => {
  const res = await request(app)
    .post("/api/businesses")
    .set("Authorization", `Bearer ${token}`)
    .send({ companyName: "Acme Pvt Ltd", ...data })
    .expect(201);
  return res.body.business;
};

describe("Business endpoints", () => {
  beforeEach(async () => {
    await db.delete(users);
  });

  // ---------- Auth gate ----------
  describe("Auth", () => {
    it("401 without a token", async () => {
      await request(app).get("/api/businesses").expect(401);
    });
  });

  // ---------- POST / ----------
  describe("POST /api/businesses", () => {
    it("creates a business", async () => {
      const { token } = await registerUser();
      const res = await request(app)
        .post("/api/businesses")
        .set("Authorization", `Bearer ${token}`)
        .send({ companyName: "Acme Pvt Ltd" })
        .expect(201);

      expect(res.body.business.companyName).toBe("Acme Pvt Ltd");
      expect(res.body.business.isProfileComplete).toBe(false);
    });

    it("allows a user to create multiple businesses", async () => {
      const { token } = await registerUser();
      await createBusiness(token, { companyName: "Acme" });
      await createBusiness(token, { companyName: "Beta" });

      const res = await request(app)
        .get("/api/businesses")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(res.body.businesses.length).toBe(2);
    });

    it("400 without companyName", async () => {
      const { token } = await registerUser();
      await request(app)
        .post("/api/businesses")
        .set("Authorization", `Bearer ${token}`)
        .send({})
        .expect(400);
    });
  });

  // ---------- GET / ----------
  describe("GET /api/businesses", () => {
    it("returns only my businesses", async () => {
      const me = await registerUser();
      const other = await registerUser();

      await createBusiness(me.token, { companyName: "Mine" });
      await createBusiness(other.token, { companyName: "Theirs" });

      const res = await request(app)
        .get("/api/businesses")
        .set("Authorization", `Bearer ${me.token}`)
        .expect(200);

      expect(res.body.businesses.length).toBe(1);
      expect(res.body.businesses[0].companyName).toBe("Mine");
    });

    it("returns empty when I own nothing", async () => {
      const { token } = await registerUser();
      const res = await request(app)
        .get("/api/businesses")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
      expect(res.body.businesses).toEqual([]);
    });
  });

  // ---------- GET /:id ----------
  describe("GET /api/businesses/:id", () => {
    it("owner can fetch their business", async () => {
      const { token } = await registerUser();
      const biz = await createBusiness(token);

      const res = await request(app)
        .get(`/api/businesses/${biz.id}`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
      expect(res.body.business.id).toBe(biz.id);
    });

    it("non-owner gets 403", async () => {
      const owner = await registerUser();
      const attacker = await registerUser();
      const biz = await createBusiness(owner.token);

      await request(app)
        .get(`/api/businesses/${biz.id}`)
        .set("Authorization", `Bearer ${attacker.token}`)
        .expect(403);
    });

    it("404 for a nonexistent business", async () => {
      const { token } = await registerUser();
      const fake = "00000000-0000-0000-0000-000000000000";
      await request(app)
        .get(`/api/businesses/${fake}`)
        .set("Authorization", `Bearer ${token}`)
        .expect(404);
    });
  });

  // ---------- PATCH /:id ----------
  describe("PATCH /api/businesses/:id", () => {
    it("updates a business", async () => {
      const { token } = await registerUser();
      const biz = await createBusiness(token);

      const res = await request(app)
        .patch(`/api/businesses/${biz.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ city: "Bangalore", fundingAsk: 5000000 })
        .expect(200);

      expect(res.body.business.city).toBe("Bangalore");
    });

    it("400 for empty body", async () => {
      const { token } = await registerUser();
      const biz = await createBusiness(token);

      await request(app)
        .patch(`/api/businesses/${biz.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({})
        .expect(400);
    });

    it("403 for non-owner", async () => {
      const owner = await registerUser();
      const attacker = await registerUser();
      const biz = await createBusiness(owner.token);

      await request(app)
        .patch(`/api/businesses/${biz.id}`)
        .set("Authorization", `Bearer ${attacker.token}`)
        .send({ city: "Hijack" })
        .expect(403);
    });

    it("strips unknown fields (no privilege escalation)", async () => {
      const { token } = await registerUser();
      const biz = await createBusiness(token);

      const res = await request(app)
        .patch(`/api/businesses/${biz.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({
          city: "Bangalore",
          ownerId: "attacker-id",
          verificationTier: "verified",
        })
        .expect(200);

      expect(res.body.business.verificationTier).toBe("unverified");
      expect(res.body.business.ownerId).not.toBe("attacker-id");
    });
  });

  // ---------- POST /:id/complete ----------
  describe("POST /api/businesses/:id/complete", () => {
    it("400 with missing fields when incomplete", async () => {
      const { token } = await registerUser();
      const biz = await createBusiness(token);

      const res = await request(app)
        .post(`/api/businesses/${biz.id}/complete`)
        .set("Authorization", `Bearer ${token}`)
        .expect(400);

      expect(res.body.details.missingFields).toContain("sector");
    });

    it("200 and sets isProfileComplete when all fields present", async () => {
      const { token } = await registerUser();
      const biz = await createBusiness(token);

      await request(app)
        .patch(`/api/businesses/${biz.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({
          sector: "SaaS",
          city: "Bangalore",
          description: "We do SaaS things",
          fundingAsk: 5000000,
          yearsOperating: 3,
        })
        .expect(200);

      const res = await request(app)
        .post(`/api/businesses/${biz.id}/complete`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(res.body.isProfileComplete).toBe(true);
    });
  });

  // ---------- GET /:id/history ----------
  describe("GET /api/businesses/:id/history", () => {
    it("returns edit history newest first", async () => {
      const { token } = await registerUser();
      const biz = await createBusiness(token);

      await request(app)
        .patch(`/api/businesses/${biz.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ city: "First" })
        .expect(200);

      await new Promise((r) => setTimeout(r, 20));

      await request(app)
        .patch(`/api/businesses/${biz.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ city: "Second" })
        .expect(200);

      const res = await request(app)
        .get(`/api/businesses/${biz.id}/history`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(res.body.history.length).toBe(2);
      expect(res.body.history[0].newValue).toBe("Second");
    });

    it("403 for non-owner", async () => {
      const owner = await registerUser();
      const attacker = await registerUser();
      const biz = await createBusiness(owner.token);

      await request(app)
        .get(`/api/businesses/${biz.id}/history`)
        .set("Authorization", `Bearer ${attacker.token}`)
        .expect(403);
    });
  });
});