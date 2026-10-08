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

    it("adds 5 points per profile field", async () => {
      const { token, businessId } = await setupBusiness();

      await db
        .update(businesses)
        .set({
          sector: "SaaS",
          city: "Bangalore",
          description: "We build tools",
          fundingAsk: 5000000,
          yearsOperating: 3,
        })
        .where(eq(businesses.id, businessId));

      const res = await request(app)
        .post(`/api/businesses/${businessId}/readiness/recompute`)
        .set("Authorization", `Bearer ${token}`)
        .expect(201);

      // 6 fields × 5 = 30, plus yearsOperating (3) = 43
      expect(res.body.readiness.score).toBe(43);
    });

    it("awards 5 points per document number", async () => {
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

      // 5 (companyName) + 10 (two docs) = 15
      expect(res.body.readiness.score).toBe(15);
    });

    it("awards 15 points for verified tier", async () => {
      const { token, businessId } = await setupBusiness();

      await db
        .update(businesses)
        .set({ verificationTier: "verified" })
        .where(eq(businesses.id, businessId));

      const res = await request(app)
        .post(`/api/businesses/${businessId}/readiness/recompute`)
        .set("Authorization", `Bearer ${token}`)
        .expect(201);

      expect(res.body.readiness.score).toBe(20); // 5 + 15
    });

    it("gives a fully complete business 100", async () => {
      const { token, businessId } = await setupBusiness();
      const longDesc = "a".repeat(150);

      await db
        .update(businesses)
        .set({
          sector: "SaaS",
          city: "Bangalore",
          description: longDesc,
          fundingAsk: 5000000,
          yearsOperating: 15,
          udyamNumber: "UDYAM-XX-00-0000000",
          gstNumber: "29ABCDE1234F1Z5",
          shopActLicense: "SHOP-123",
          verificationTier: "verified",
          isProfileComplete: true,
        })
        .where(eq(businesses.id, businessId));

      const res = await request(app)
        .post(`/api/businesses/${businessId}/readiness/recompute`)
        .set("Authorization", `Bearer ${token}`)
        .expect(201);

      expect(res.body.readiness.score).toBe(100);
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

    it("shapBreakdown contributions sum to the score", async () => {
      const { token, businessId } = await setupBusiness();

      const res = await request(app)
        .post(`/api/businesses/${businessId}/readiness/recompute`)
        .set("Authorization", `Bearer ${token}`)
        .expect(201);

      const sum = res.body.readiness.shapBreakdown.reduce(
        (s, f) => s + f.contribution,
        0
      );
      expect(sum).toBe(res.body.readiness.score);
    });

    it("suggestions reference the biggest gaps first", async () => {
      const { token, businessId } = await setupBusiness();

      const res = await request(app)
        .post(`/api/businesses/${businessId}/readiness/recompute`)
        .set("Authorization", `Bearer ${token}`)
        .expect(201);

      // Fresh business has gaps in profileCompleteness (25 remaining), documents (15), etc.
      expect(res.body.readiness.suggestions[0]).toMatch(/profile field/i);
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