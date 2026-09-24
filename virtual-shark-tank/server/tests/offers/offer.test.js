import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../src/app.js";
import { db } from "../../src/config/db.postgres.js";
import {
  users,
  investments,
  pitches,
  offers,
} from "../../src/models/postgres/index.js";
import { _resetAll as resetRateLimits } from "../../src/services/rateLimit.service.js";

// ---- Helpers ----

const registerUser = async () => {
  const email = `t-${Date.now()}-${Math.random()}@example.com`;
  const res = await request(app)
    .post("/api/auth/register")
    .send({ name: "Test User", email, password: "Password123" })
    .expect(201);
  return { user: res.body.user, token: res.body.accessToken };
};

// Full setup: owner + business + complete + pitch + publish
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

const createOfferAs = async (investorToken, pitchId, overrides = {}) => {
  const res = await request(app)
    .post("/api/offers")
    .set("Authorization", `Bearer ${investorToken}`)
    .send({
      pitchId,
      amount: 5000000,
      equityRequested: 8,
      ...overrides,
    })
    .expect(201);
  return res.body.offer;
};

describe("Offer endpoints", () => {
  beforeEach(async () => {
    await db.delete(investments);
    await db.delete(users);
    resetRateLimits();
  });

  // ---------- POST /api/offers ----------
  describe("POST /api/offers", () => {
    it("creates an offer on a live pitch", async () => {
      const { pitchId } = await setupLivePitch();
      const investor = await registerUser();

      const offer = await createOfferAs(investor.token, pitchId);
      expect(offer.status).toBe("pending");
      expect(offer.investorId).toBe(investor.user.id);
    });

    it("401 without a token", async () => {
      const { pitchId } = await setupLivePitch();
      await request(app)
        .post("/api/offers")
        .send({ pitchId, amount: 5000000, equityRequested: 8 })
        .expect(401);
    });

    it("400 on invalid body", async () => {
      const { pitchId } = await setupLivePitch();
      const investor = await registerUser();

      await request(app)
        .post("/api/offers")
        .set("Authorization", `Bearer ${investor.token}`)
        .send({ pitchId, amount: -1, equityRequested: 8 })
        .expect(400);
    });

    it("400 when offering on your own business", async () => {
      const { owner, pitchId } = await setupLivePitch();

      await request(app)
        .post("/api/offers")
        .set("Authorization", `Bearer ${owner.token}`)
        .send({ pitchId, amount: 5000000, equityRequested: 8 })
        .expect(400);
    });

    it("409 for a second pending offer on the same pitch", async () => {
      const { pitchId } = await setupLivePitch();
      const investor = await registerUser();
      await createOfferAs(investor.token, pitchId);

      await request(app)
        .post("/api/offers")
        .set("Authorization", `Bearer ${investor.token}`)
        .send({ pitchId, amount: 6000000, equityRequested: 10 })
        .expect(409);
    });

    it("strips unknown fields (no status escalation)", async () => {
      const { pitchId } = await setupLivePitch();
      const investor = await registerUser();

      const res = await request(app)
        .post("/api/offers")
        .set("Authorization", `Bearer ${investor.token}`)
        .send({
          pitchId,
          amount: 5000000,
          equityRequested: 8,
          status: "accepted",
          investorId: "attacker",
        })
        .expect(201);

      expect(res.body.offer.status).toBe("pending");
      expect(res.body.offer.investorId).toBe(investor.user.id);
    });
  });

  // ---------- GET /api/offers/me ----------
  describe("GET /api/offers/me", () => {
    it("returns only my offers", async () => {
      const { pitchId } = await setupLivePitch();
      const me = await registerUser();
      const other = await registerUser();

      await createOfferAs(me.token, pitchId);
      await createOfferAs(other.token, pitchId);

      const res = await request(app)
        .get("/api/offers/me")
        .set("Authorization", `Bearer ${me.token}`)
        .expect(200);

      expect(res.body.offers.length).toBe(1);
      expect(res.body.offers[0].offer.investorId).toBe(me.user.id);
    });

    it("empty when I made none", async () => {
      const investor = await registerUser();
      const res = await request(app)
        .get("/api/offers/me")
        .set("Authorization", `Bearer ${investor.token}`)
        .expect(200);
      expect(res.body.offers).toEqual([]);
    });

    it("401 without auth", async () => {
      await request(app).get("/api/offers/me").expect(401);
    });
  });

  // ---------- GET /api/offers/received ----------
  describe("GET /api/offers/received", () => {
    it("owner sees offers on their business", async () => {
      const { owner, businessId, pitchId } = await setupLivePitch();
      const investor = await registerUser();
      await createOfferAs(investor.token, pitchId);

      const res = await request(app)
        .get(`/api/offers/received?businessId=${businessId}`)
        .set("Authorization", `Bearer ${owner.token}`)
        .expect(200);

      expect(res.body.offers.length).toBe(1);
    });

    it("400 without businessId query param", async () => {
      const investor = await registerUser();
      await request(app)
        .get("/api/offers/received")
        .set("Authorization", `Bearer ${investor.token}`)
        .expect(400);
    });

    it("403 for a non-owner", async () => {
      const { businessId } = await setupLivePitch();
      const attacker = await registerUser();

      await request(app)
        .get(`/api/offers/received?businessId=${businessId}`)
        .set("Authorization", `Bearer ${attacker.token}`)
        .expect(403);
    });
  });

  // ---------- GET /api/offers/:id ----------
  describe("GET /api/offers/:id", () => {
    it("investor can fetch their own offer", async () => {
      const { pitchId } = await setupLivePitch();
      const investor = await registerUser();
      const offer = await createOfferAs(investor.token, pitchId);

      const res = await request(app)
        .get(`/api/offers/${offer.id}`)
        .set("Authorization", `Bearer ${investor.token}`)
        .expect(200);
      expect(res.body.offer.id).toBe(offer.id);
    });

    it("business owner can fetch", async () => {
      const { owner, pitchId } = await setupLivePitch();
      const investor = await registerUser();
      const offer = await createOfferAs(investor.token, pitchId);

      await request(app)
        .get(`/api/offers/${offer.id}`)
        .set("Authorization", `Bearer ${owner.token}`)
        .expect(200);
    });

    it("outsider gets 403", async () => {
      const { pitchId } = await setupLivePitch();
      const investor = await registerUser();
      const offer = await createOfferAs(investor.token, pitchId);
      const outsider = await registerUser();

      await request(app)
        .get(`/api/offers/${offer.id}`)
        .set("Authorization", `Bearer ${outsider.token}`)
        .expect(403);
    });
  });

  // ---------- POST /api/offers/:id/counter ----------
  describe("POST /api/offers/:id/counter", () => {
    it("business owner can counter", async () => {
      const { owner, pitchId } = await setupLivePitch();
      const investor = await registerUser();
      const offer = await createOfferAs(investor.token, pitchId);

      const res = await request(app)
        .post(`/api/offers/${offer.id}/counter`)
        .set("Authorization", `Bearer ${owner.token}`)
        .send({ amount: 6000000, equityRequested: 10 })
        .expect(201);

      expect(res.body.offer.parentOfferId).toBe(offer.id);
      expect(res.body.offer.initiatedById).toBe(owner.user.id);
    });

    it("investor can counter the counter (alternation)", async () => {
      const { owner, pitchId } = await setupLivePitch();
      const investor = await registerUser();
      const offer = await createOfferAs(investor.token, pitchId);

      const counterRes = await request(app)
        .post(`/api/offers/${offer.id}/counter`)
        .set("Authorization", `Bearer ${owner.token}`)
        .send({ amount: 6000000, equityRequested: 10 })
        .expect(201);

      const res = await request(app)
        .post(`/api/offers/${counterRes.body.offer.id}/counter`)
        .set("Authorization", `Bearer ${investor.token}`)
        .send({ amount: 5500000, equityRequested: 9 })
        .expect(201);

      expect(res.body.offer.initiatedById).toBe(investor.user.id);
    });

    it("403 when countering your own offer", async () => {
      const { pitchId } = await setupLivePitch();
      const investor = await registerUser();
      const offer = await createOfferAs(investor.token, pitchId);

      await request(app)
        .post(`/api/offers/${offer.id}/counter`)
        .set("Authorization", `Bearer ${investor.token}`)
        .send({ amount: 6000000, equityRequested: 10 })
        .expect(403);
    });
  });

  // ---------- POST /api/offers/:id/accept ----------
  describe("POST /api/offers/:id/accept", () => {
    it("accepts and creates an investment", async () => {
      const { owner, pitchId } = await setupLivePitch();
      const investor = await registerUser();
      const offer = await createOfferAs(investor.token, pitchId);

      const res = await request(app)
        .post(`/api/offers/${offer.id}/accept`)
        .set("Authorization", `Bearer ${owner.token}`)
        .expect(200);

      expect(res.body.offer.status).toBe("accepted");
      expect(res.body.investment).toBeDefined();
      expect(res.body.investment.investorId).toBe(investor.user.id);
    });

    it("funds the pitch", async () => {
      const { owner, pitchId } = await setupLivePitch();
      const investor = await registerUser();
      const offer = await createOfferAs(investor.token, pitchId);
      await request(app)
        .post(`/api/offers/${offer.id}/accept`)
        .set("Authorization", `Bearer ${owner.token}`)
        .expect(200);

      const pitchRes = await request(app)
        .get(`/api/pitches/${pitchId}`)
        .set("Authorization", `Bearer ${owner.token}`)
        .expect(200);
      expect(pitchRes.body.pitch.status).toBe("funded");
    });

    it("403 for non-owner", async () => {
      const { pitchId } = await setupLivePitch();
      const investor = await registerUser();
      const offer = await createOfferAs(investor.token, pitchId);
      const attacker = await registerUser();

      await request(app)
        .post(`/api/offers/${offer.id}/accept`)
        .set("Authorization", `Bearer ${attacker.token}`)
        .expect(403);
    });

    it("403 when the investor tries to accept their own offer", async () => {
      const { pitchId } = await setupLivePitch();
      const investor = await registerUser();
      const offer = await createOfferAs(investor.token, pitchId);

      await request(app)
        .post(`/api/offers/${offer.id}/accept`)
        .set("Authorization", `Bearer ${investor.token}`)
        .expect(403);
    });
  });

  // ---------- POST /api/offers/:id/reject ----------
  describe("POST /api/offers/:id/reject", () => {
    it("owner can reject", async () => {
      const { owner, pitchId } = await setupLivePitch();
      const investor = await registerUser();
      const offer = await createOfferAs(investor.token, pitchId);

      const res = await request(app)
        .post(`/api/offers/${offer.id}/reject`)
        .set("Authorization", `Bearer ${owner.token}`)
        .expect(200);
      expect(res.body.offer.status).toBe("rejected");
    });

    it("403 for non-owner", async () => {
      const { pitchId } = await setupLivePitch();
      const investor = await registerUser();
      const offer = await createOfferAs(investor.token, pitchId);
      const attacker = await registerUser();

      await request(app)
        .post(`/api/offers/${offer.id}/reject`)
        .set("Authorization", `Bearer ${attacker.token}`)
        .expect(403);
    });
  });

  // ---------- POST /api/offers/:id/withdraw ----------
  describe("POST /api/offers/:id/withdraw", () => {
    it("investor can withdraw their offer", async () => {
      const { pitchId } = await setupLivePitch();
      const investor = await registerUser();
      const offer = await createOfferAs(investor.token, pitchId);

      const res = await request(app)
        .post(`/api/offers/${offer.id}/withdraw`)
        .set("Authorization", `Bearer ${investor.token}`)
        .expect(200);
      expect(res.body.offer.status).toBe("withdrawn");
    });

    it("403 when the business owner tries to withdraw", async () => {
      const { owner, pitchId } = await setupLivePitch();
      const investor = await registerUser();
      const offer = await createOfferAs(investor.token, pitchId);

      await request(app)
        .post(`/api/offers/${offer.id}/withdraw`)
        .set("Authorization", `Bearer ${owner.token}`)
        .expect(403);
    });
  });

  // ---------- GET /api/offers/:id/thread ----------
  describe("GET /api/offers/:id/thread", () => {
    it("returns the full chain in order", async () => {
      const { owner, pitchId } = await setupLivePitch();
      const investor = await registerUser();
      const o1 = await createOfferAs(investor.token, pitchId);

      const c1 = await request(app)
        .post(`/api/offers/${o1.id}/counter`)
        .set("Authorization", `Bearer ${owner.token}`)
        .send({ amount: 6000000, equityRequested: 10 })
        .expect(201);

      const c2 = await request(app)
        .post(`/api/offers/${c1.body.offer.id}/counter`)
        .set("Authorization", `Bearer ${investor.token}`)
        .send({ amount: 5500000, equityRequested: 9 })
        .expect(201);

      const res = await request(app)
        .get(`/api/offers/${c2.body.offer.id}/thread`)
        .set("Authorization", `Bearer ${investor.token}`)
        .expect(200);

      expect(res.body.thread.length).toBe(3);
      expect(res.body.thread[0].id).toBe(o1.id);
      expect(res.body.thread[2].id).toBe(c2.body.offer.id);
    });

    it("403 for an outsider", async () => {
      const { pitchId } = await setupLivePitch();
      const investor = await registerUser();
      const offer = await createOfferAs(investor.token, pitchId);
      const outsider = await registerUser();

      await request(app)
        .get(`/api/offers/${offer.id}/thread`)
        .set("Authorization", `Bearer ${outsider.token}`)
        .expect(403);
    });
  });
});