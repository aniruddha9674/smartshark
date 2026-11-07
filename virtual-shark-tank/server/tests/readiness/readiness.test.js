import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import app from "../../src/app.js";
import { db } from "../../src/config/db.postgres.js";
import {
  users,
  businesses,
  readinessScores,
  profileEditHistory,
} from "../../src/models/postgres/index.js";

const setupBusiness = async (overrides = {}) => {
  const email = `rd-${Date.now()}-${Math.random()}@example.com`;
  const reg = await request(app)
    .post("/api/auth/register")
    .send({ name: "Biz", email, password: "Password123", role: "business" })
    .expect(201);

  const biz = await request(app)
    .post("/api/businesses")
    .set("Authorization", `Bearer ${reg.body.accessToken}`)
    .send({ companyName: "Acme Pvt Ltd", ...overrides })
    .expect(201);

  return {
    user: reg.body.user,
    token: reg.body.accessToken,
    businessId: biz.body.business.id,
  };
};

describe("Readiness endpoints", () => {
  beforeEach(async () => {
    await db.delete(readinessScores);
    await db.delete(profileEditHistory);
    await db.delete(businesses);
    await db.delete(users);
  });

  describe("POST /api/businesses/:id/readiness/recompute", () => {
    it("scores a fresh business at 5 (only companyName filled)", async () => {
      const { token, businessId } = await setupBusiness();

      const res = await request(app)
        .post(`/api/businesses/${businessId}/readiness/recompute`)
        .set("Authorization", `Bearer ${token}`)
        .expect(201);

      expect(res.body.readiness.score).toBe(5);
      expect(res.body.readiness.modelVersion).toBe("rules-v1");
      expect(res.body.readiness.suggestions.length).toBeGreaterThan(0);
      expect(res.body.readiness.suggestions.length).toBeLessThanOrEqual(3);
    });

    it("scores 20 for companyName + sector + city + fundingAsk (short description)", async () => {
      const { token, businessId } = await setupBusiness();

      await db
        .update(businesses)
        .set({
          sector: "SaaS",
          city: "Bangalore",
          description: "We build tools", // 15 chars — below 100 threshold
          fundingAsk: 5000000,
          yearsOperating: 3, // not scored in new model
        })
        .where(eq(businesses.id, businessId));

      const res = await request(app)
        .post(`/api/businesses/${businessId}/readiness/recompute`)
        .set("Authorization", `Bearer ${token}`)
        .expect(201);

      // companyName(5) + sector(5) + city(5) + fundingAsk(5) = 20
      // description too short, yearsOperating not a feature
      expect(res.body.readiness.score).toBe(20);
    });

    it("scores 15 when description is 100+ characters", async () => {
      const { token, businessId } = await setupBusiness();

      await db
        .update(businesses)
        .set({ description: "a".repeat(150) })
        .where(eq(businesses.id, businessId));

      const res = await request(app)
        .post(`/api/businesses/${businessId}/readiness/recompute`)
        .set("Authorization", `Bearer ${token}`)
        .expect(201);

      // companyName(5) + description(10) = 15
      expect(res.body.readiness.score).toBe(15);
    });

    it("does not score individual document numbers (only tier)", async () => {
      const { token, businessId } = await setupBusiness();

      await db
        .update(businesses)
        .set({
          udyamNumber: "UDYAM-XX-00-0000000",
          gstNumber: "29ABCDE1234F1Z5",
        })
        .where(eq(businesses.id, businessId));

      const res = await request(app)
        .post(`/api/businesses/${businessId}/readiness/recompute`)
        .set("Authorization", `Bearer ${token}`)
        .expect(201);

      // New model scores tier, not individual docs. Tier stays unverified → 5
      expect(res.body.readiness.score).toBe(5);
    });

    it("awards 10 points for verified tier", async () => {
      const { token, businessId } = await setupBusiness();

      await db
        .update(businesses)
        .set({ verificationTier: "verified" })
        .where(eq(businesses.id, businessId));

      const res = await request(app)
        .post(`/api/businesses/${businessId}/readiness/recompute`)
        .set("Authorization", `Bearer ${token}`)
        .expect(201);

      // companyName(5) + verifiedDocs(10) = 15
      expect(res.body.readiness.score).toBe(15);
    });

    it("awards 5 points for basic tier", async () => {
      const { token, businessId } = await setupBusiness();

      await db
        .update(businesses)
        .set({ verificationTier: "basic" })
        .where(eq(businesses.id, businessId));

      const res = await request(app)
        .post(`/api/businesses/${businessId}/readiness/recompute`)
        .set("Authorization", `Bearer ${token}`)
        .expect(201);

      // companyName(5) + basicDocs(5) = 10
      expect(res.body.readiness.score).toBe(10);
    });

    it("scores 35 for the minimum-filled business (name+sector+city+long desc+verified)", async () => {
      const { token, businessId } = await setupBusiness();

      await db
        .update(businesses)
        .set({
          sector: "SaaS",
          city: "Bangalore",
          description: "a".repeat(150),
          fundingAsk: 5000000,
          udyamNumber: "UDYAM-XX-00-0000000",
          gstNumber: "29ABCDE1234F1Z5",
          shopActLicense: "SHOP-123",
          verificationTier: "verified",
          isProfileComplete: true, // not scored in new model
        })
        .where(eq(businesses.id, businessId));

      const res = await request(app)
        .post(`/api/businesses/${businessId}/readiness/recompute`)
        .set("Authorization", `Bearer ${token}`)
        .expect(201);

      // companyName(5) + sector(5) + city(5) + description(10) +
      // fundingAsk(5) + verifiedDocs(10) = 40
      // Note: udyamNumber/gstNumber/shopActLicense don't score independently
      // (only tier does), isProfileComplete not a feature
      expect(res.body.readiness.score).toBe(40);
    });

    it("persists a row to readiness_scores", async () => {
      const { token, businessId } = await setupBusiness();

      await request(app)
        .post(`/api/businesses/${businessId}/readiness/recompute`)
        .set("Authorization", `Bearer ${token}`)
        .expect(201);

      const rows = await db.select().from(readinessScores);
      expect(rows).toHaveLength(1);
      expect(rows[0].businessId).toBe(businessId);
      expect(rows[0].modelVersion).toBe("rules-v1");
    });

    it("breakdown points sum to the score", async () => {
      const { token, businessId } = await setupBusiness();

      const res = await request(app)
        .post(`/api/businesses/${businessId}/readiness/recompute`)
        .set("Authorization", `Bearer ${token}`)
        .expect(201);

      const sum = res.body.readiness.shapBreakdown.reduce(
        (s, f) => s + f.points,
        0
      );
      expect(sum).toBe(res.body.readiness.score);
    });

    it("suggestions reference specific fields to improve", async () => {
      const { token, businessId } = await setupBusiness();

      const res = await request(app)
        .post(`/api/businesses/${businessId}/readiness/recompute`)
        .set("Authorization", `Bearer ${token}`)
        .expect(201);

      // New model produces per-field suggestions like "Add description to improve..."
      expect(res.body.readiness.suggestions[0]).toMatch(/add .+ to improve/i);
    });

    it("returns no more than 3 suggestions", async () => {
      const { token, businessId } = await setupBusiness();

      const res = await request(app)
        .post(`/api/businesses/${businessId}/readiness/recompute`)
        .set("Authorization", `Bearer ${token}`)
        .expect(201);

      expect(res.body.readiness.suggestions.length).toBeLessThanOrEqual(3);
    });

    it("403 for a business I don't own", async () => {
      const owner = await setupBusiness();
      const attacker = await setupBusiness();

      await request(app)
        .post(`/api/businesses/${owner.businessId}/readiness/recompute`)
        .set("Authorization", `Bearer ${attacker.token}`)
        .expect(403);
    });

    it("404 for nonexistent business", async () => {
      const { token } = await setupBusiness();
      const fake = "00000000-0000-4000-8000-000000000000";

      await request(app)
        .post(`/api/businesses/${fake}/readiness/recompute`)
        .set("Authorization", `Bearer ${token}`)
        .expect(404);
    });
  });

  describe("GET /api/businesses/:id/readiness", () => {
    it("returns the latest score", async () => {
      const { token, businessId } = await setupBusiness();

      await request(app)
        .post(`/api/businesses/${businessId}/readiness/recompute`)
        .set("Authorization", `Bearer ${token}`)
        .expect(201);

      const res = await request(app)
        .get(`/api/businesses/${businessId}/readiness`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(res.body.readiness.score).toBeGreaterThan(0);
    });

    it("returns null when no score exists", async () => {
      const { token, businessId } = await setupBusiness();

      const res = await request(app)
        .get(`/api/businesses/${businessId}/readiness`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(res.body.readiness).toBeNull();
    });
  });

  describe("GET /api/businesses/:id/readiness/trend", () => {
    it("returns scores in chronological order", async () => {
      const { token, businessId } = await setupBusiness();

      for (let i = 0; i < 3; i++) {
        await request(app)
          .post(`/api/businesses/${businessId}/readiness/recompute`)
          .set("Authorization", `Bearer ${token}`)
          .expect(201);
        await new Promise((r) => setTimeout(r, 20));
      }

      const res = await request(app)
        .get(`/api/businesses/${businessId}/readiness/trend`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(res.body.trend).toHaveLength(3);
      const times = res.body.trend.map((r) => new Date(r.computedAt).getTime());
      expect(times).toEqual([...times].sort((a, b) => a - b));
    });

    it("respects the days filter", async () => {
      const { token, businessId } = await setupBusiness();

      await request(app)
        .post(`/api/businesses/${businessId}/readiness/recompute`)
        .set("Authorization", `Bearer ${token}`)
        .expect(201);

      const res = await request(app)
        .get(`/api/businesses/${businessId}/readiness/trend?days=1`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(res.body.trend.length).toBeGreaterThanOrEqual(1);
    });

    it("400 for invalid days param", async () => {
      const { token, businessId } = await setupBusiness();

      await request(app)
        .get(`/api/businesses/${businessId}/readiness/trend?days=999`)
        .set("Authorization", `Bearer ${token}`)
        .expect(400);
    });
  });
});