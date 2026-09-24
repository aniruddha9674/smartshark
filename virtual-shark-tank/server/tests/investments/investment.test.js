import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../src/app.js";
import { db } from "../../src/config/db.postgres.js";
import { users, investments } from "../../src/models/postgres/index.js";
import { _resetAll as resetRateLimits } from "../../src/services/rateLimit.service.js";

const registerUser = async () => {
  const email = `t-${Date.now()}-${Math.random()}@example.com`;
  const res = await request(app)
    .post("/api/auth/register")
    .send({ name: "Test User", email, password: "Password123" })
    .expect(201);
  return { user: res.body.user, token: res.body.accessToken };
};

const setupLivePitch = async () => {
  const owner = await registerUser();

  const bizRes = await request(app)
    .post("/api/businesses")
    .set("Authorization", `Bearer ${owner.token}`)
    .send({ companyName: "Acme Pvt Ltd" })
    .expect(201);
  const businessId = bizRes.body.business.id;

  await request(app)
    .patch(`/api/businesses/${businessId}`)
    .set("Authorization", `Bearer ${owner.token}`)
    .send({
      sector: "SaaS",
      city: "Bangalore",
      description: "We build SaaS tools",
      fundingAsk: 5000000,
      yearsOperating: 3,
    })
    .expect(200);

  await request(app)
    .post(`/api/businesses/${businessId}/complete`)
    .set("Authorization", `Bearer ${owner.token}`)
    .expect(200);

  const pitchRes = await request(app)
    .post("/api/pitches")
    .set("Authorization", `Bearer ${owner.token}`)
    .send({
      businessId,
      title: "Seed Round 2026",
      tagline: "Invest in the future",
      shortPitch: "We help X do Y",
      longSummary: "Long form pitch text",
      askAmount: 5000000,
      equityOffered: 8,
      stage: "mvp",
      revenueRange: "under_10L",
    })
    .expect(201);
  const pitchId = pitchRes.body.pitch.id;

  await request(app)
    .post(`/api/pitches/${pitchId}/publish`)
    .set("Authorization", `Bearer ${owner.token}`)
    .expect(200);

  return { owner, businessId, pitchId };
};

// Runs the full flow to produce a real investment via the API
const closeDeal = async () => {
  const { owner, businessId, pitchId } = await setupLivePitch();
  const investor = await registerUser();

  const offerRes = await request(app)
    .post("/api/offers")
    .set("Authorization", `Bearer ${investor.token}`)
    .send({ pitchId, amount: 5000000, equityRequested: 8 })
    .expect(201);

  const acceptRes = await request(app)
    .post(`/api/offers/${offerRes.body.offer.id}/accept`)
    .set("Authorization", `Bearer ${owner.token}`)
    .expect(200);

  return {
    owner,
    businessId,
    pitchId,
    investor,
    investment: acceptRes.body.investment,
  };
};

describe("Investment endpoints", () => {
  beforeEach(async () => {
    await db.delete(investments);
    await db.delete(users);
    resetRateLimits();
  });

  // ---------- GET /api/investments/me ----------
  describe("GET /api/investments/me", () => {
    it("returns my portfolio", async () => {
      const { investor, investment } = await closeDeal();

      const res = await request(app)
        .get("/api/investments/me")
        .set("Authorization", `Bearer ${investor.token}`)
        .expect(200);

      expect(res.body.investments.length).toBe(1);
      expect(res.body.investments[0].investment.id).toBe(investment.id);
    });

    it("empty when I've invested in nothing", async () => {
      const investor = await registerUser();
      const res = await request(app)
        .get("/api/investments/me")
        .set("Authorization", `Bearer ${investor.token}`)
        .expect(200);
      expect(res.body.investments).toEqual([]);
    });

    it("401 without auth", async () => {
      await request(app).get("/api/investments/me").expect(401);
    });
  });

  // ---------- GET /api/investments/summary ----------
  describe("GET /api/investments/summary", () => {
    it("returns aggregate stats", async () => {
      const { investor } = await closeDeal();

      const res = await request(app)
        .get("/api/investments/summary")
        .set("Authorization", `Bearer ${investor.token}`)
        .expect(200);

      expect(res.body.investmentCount).toBe(1);
      expect(res.body.totalInvested).toBe("5000000");
      expect(res.body.byStatus.active).toBe(1);
    });

    it("returns zeros when no investments", async () => {
      const investor = await registerUser();
      const res = await request(app)
        .get("/api/investments/summary")
        .set("Authorization", `Bearer ${investor.token}`)
        .expect(200);

      expect(res.body.investmentCount).toBe(0);
      expect(res.body.totalInvested).toBe("0");
    });
  });

  // ---------- GET /api/investments/received ----------
  describe("GET /api/investments/received", () => {
    it("business owner sees funding received", async () => {
      const { owner, businessId, investment } = await closeDeal();

      const res = await request(app)
        .get(`/api/investments/received?businessId=${businessId}`)
        .set("Authorization", `Bearer ${owner.token}`)
        .expect(200);

      expect(res.body.investments.length).toBe(1);
      expect(res.body.investments[0].investment.id).toBe(investment.id);
    });

    it("403 for non-owner", async () => {
      const { businessId } = await closeDeal();
      const attacker = await registerUser();

      await request(app)
        .get(`/api/investments/received?businessId=${businessId}`)
        .set("Authorization", `Bearer ${attacker.token}`)
        .expect(403);
    });

    it("400 without businessId", async () => {
      const investor = await registerUser();
      await request(app)
        .get("/api/investments/received")
        .set("Authorization", `Bearer ${investor.token}`)
        .expect(400);
    });
  });

  // ---------- GET /api/investments/:id ----------
  describe("GET /api/investments/:id", () => {
    it("investor can fetch their own investment", async () => {
      const { investor, investment } = await closeDeal();

      const res = await request(app)
        .get(`/api/investments/${investment.id}`)
        .set("Authorization", `Bearer ${investor.token}`)
        .expect(200);

      expect(res.body.investment.id).toBe(investment.id);
    });

    it("business owner can fetch it too", async () => {
      const { owner, investment } = await closeDeal();

      await request(app)
        .get(`/api/investments/${investment.id}`)
        .set("Authorization", `Bearer ${owner.token}`)
        .expect(200);
    });

    it("403 for an outsider", async () => {
      const { investment } = await closeDeal();
      const outsider = await registerUser();

      await request(app)
        .get(`/api/investments/${investment.id}`)
        .set("Authorization", `Bearer ${outsider.token}`)
        .expect(403);
    });

    it("404 for a nonexistent investment", async () => {
      const investor = await registerUser();
      const fake = "00000000-0000-0000-0000-000000000000";

      await request(app)
        .get(`/api/investments/${fake}`)
        .set("Authorization", `Bearer ${investor.token}`)
        .expect(404);
    });
  });
});