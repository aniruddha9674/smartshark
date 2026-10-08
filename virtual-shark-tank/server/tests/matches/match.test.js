import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import app from "../../src/app.js";
import { db } from "../../src/config/db.postgres.js";
import {
  users,
  businesses,
  investorProfiles,
  matches,
  readinessScores,
} from "../../src/models/postgres/index.js";

const registerBusiness = async (overrides = {}) => {
  const email = `mb-${Date.now()}-${Math.random()}@example.com`;
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

const registerInvestor = async (profile = {}) => {
  const email = `mi-${Date.now()}-${Math.random()}@example.com`;
  const reg = await request(app)
    .post("/api/auth/register")
    .send({ name: "Inv", email, password: "Password123", role: "investor" })
    .expect(201);

  // Step 1: create the blank profile
  await request(app)
    .post("/api/investor/me")
    .set("Authorization", `Bearer ${reg.body.accessToken}`)
    .expect(201);

  // Step 2: set the fields that drive matching
  await request(app)
    .patch("/api/investor/me")
    .set("Authorization", `Bearer ${reg.body.accessToken}`)
    .send({
      firmName: "Test Capital",
      investmentFocus: "SaaS, Fintech",
      preferredGeography: "Bangalore, Mumbai",
      minTicketSize: 1000000,
      maxTicketSize: 10000000,
      ...profile,
    })
    .expect(200);

  return {
    user: reg.body.user,
    token: reg.body.accessToken,
  };
};

const setupBusinessReady = async (overrides = {}) => {
  const biz = await registerBusiness();
  await db
    .update(businesses)
    .set({
      sector: "SaaS",
      city: "Bangalore",
      description: "We build tools for X",
      fundingAsk: 5000000,
      yearsOperating: 3,
      isProfileComplete: true,
      ...overrides,
    })
    .where(eq(businesses.id, biz.businessId));
  return biz;
};

describe("Match endpoints", () => {
  beforeEach(async () => {
    await db.delete(readinessScores);
    await db.delete(matches);
    await db.delete(investorProfiles);
    await db.delete(businesses);
    await db.delete(users);
  });

  describe("POST /api/matches/business/:id/recompute", () => {
    it("creates matches against all active investors", async () => {
      const biz = await setupBusinessReady();
      await registerInvestor();
      await registerInvestor({ investmentFocus: "Fintech" });

      const res = await request(app)
        .post(`/api/matches/business/${biz.businessId}/recompute`)
        .set("Authorization", `Bearer ${biz.token}`)
        .expect(200);

      expect(res.body.matchedAgainst).toBe(2);
      const rows = await db.select().from(matches);
      expect(rows).toHaveLength(2);
    });

    it("scores a perfect fit at 100", async () => {
      const biz = await setupBusinessReady();
      const inv = await registerInvestor();

      // Give the business a 100 readiness score so readiness contributes full 10
      await db.insert(readinessScores).values({
        businessId: biz.businessId,
        score: 100,
        modelVersion: "rules-v1",
        shapBreakdown: [],
        suggestions: [],
      });

      await db
        .update(businesses)
        .set({ verificationTier: "verified" })
        .where(eq(businesses.id, biz.businessId));

      await request(app)
        .post(`/api/matches/business/${biz.businessId}/recompute`)
        .set("Authorization", `Bearer ${biz.token}`)
        .expect(200);

      const [row] = await db.select().from(matches);
      expect(row.matchScore).toBe(100);
    });

    it("reduces score when sector doesn't match", async () => {
      const biz = await setupBusinessReady({ sector: "Healthcare" });
      await registerInvestor({ investmentFocus: "SaaS" });

      await request(app)
        .post(`/api/matches/business/${biz.businessId}/recompute`)
        .set("Authorization", `Bearer ${biz.token}`)
        .expect(200);

      const [row] = await db.select().from(matches);
      // 0 (sector) + 25 (ticket) + 20 (geo) + 0 (unverified) + 0 (no readiness) = 45
      expect(row.matchScore).toBe(45);
    });

    it("stores per-factor reasons in matchReasons", async () => {
      const biz = await setupBusinessReady();
      await registerInvestor();

      await request(app)
        .post(`/api/matches/business/${biz.businessId}/recompute`)
        .set("Authorization", `Bearer ${biz.token}`)
        .expect(200);

      const [row] = await db.select().from(matches);
      expect(row.matchReasons).toHaveLength(5);
      expect(row.matchReasons.map((r) => r.factor).sort()).toEqual([
        "geography",
        "readiness",
        "sector",
        "ticketSize",
        "verification",
      ]);
    });

    it("upserts on repeat recompute, preserving status", async () => {
      const biz = await setupBusinessReady();
      await registerInvestor();

      await request(app)
        .post(`/api/matches/business/${biz.businessId}/recompute`)
        .set("Authorization", `Bearer ${biz.token}`)
        .expect(200);

      const [initial] = await db.select().from(matches);
      await db
        .update(matches)
        .set({ status: "shortlisted" })
        .where(eq(matches.id, initial.id));

      await request(app)
        .post(`/api/matches/business/${biz.businessId}/recompute`)
        .set("Authorization", `Bearer ${biz.token}`)
        .expect(200);

      const rows = await db.select().from(matches);
      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe("shortlisted");
    });

    it("403 for a business I don't own", async () => {
      const owner = await setupBusinessReady();
      const attacker = await registerBusiness();
      await registerInvestor();

      await request(app)
        .post(`/api/matches/business/${owner.businessId}/recompute`)
        .set("Authorization", `Bearer ${attacker.token}`)
        .expect(403);
    });
  });

  describe("POST /api/matches/investor/recompute", () => {
    it("creates matches against all complete businesses", async () => {
      const inv = await registerInvestor();
      await setupBusinessReady();
      await setupBusinessReady({ companyName: "Beta Co" });

      const res = await request(app)
        .post("/api/matches/investor/recompute")
        .set("Authorization", `Bearer ${inv.token}`)
        .expect(200);

      expect(res.body.matchedAgainst).toBe(2);
    });

    it("404 when investor profile is missing", async () => {
      const email = `no-${Date.now()}@example.com`;
      const reg = await request(app)
        .post("/api/auth/register")
        .send({ name: "NoProfile", email, password: "Password123", role: "investor" })
        .expect(201);

      await request(app)
        .post("/api/matches/investor/recompute")
        .set("Authorization", `Bearer ${reg.body.accessToken}`)
        .expect(404);
    });
  });

  describe("GET /api/matches/investor/feed", () => {
    it("returns matches sorted by score desc", async () => {
      const inv = await registerInvestor();
      const a = await setupBusinessReady({ companyName: "A Co", sector: "SaaS" });
      const b = await setupBusinessReady({ companyName: "B Co", sector: "Healthcare" });

      await request(app)
        .post(`/api/matches/business/${a.businessId}/recompute`)
        .set("Authorization", `Bearer ${a.token}`)
        .expect(200);
      await request(app)
        .post(`/api/matches/business/${b.businessId}/recompute`)
        .set("Authorization", `Bearer ${b.token}`)
        .expect(200);

      const res = await request(app)
        .get("/api/matches/investor/feed")
        .set("Authorization", `Bearer ${inv.token}`)
        .expect(200);

      expect(res.body.matches).toHaveLength(2);
      expect(res.body.matches[0].business.sector).toBe("SaaS");
      expect(res.body.matches[0].matchScore).toBeGreaterThan(
        res.body.matches[1].matchScore
      );
    });

    it("filters by minScore", async () => {
      const inv = await registerInvestor();
      const a = await setupBusinessReady({ sector: "SaaS" });
      const b = await setupBusinessReady({ companyName: "B Co", sector: "Healthcare" });

      await request(app)
        .post(`/api/matches/business/${a.businessId}/recompute`)
        .set("Authorization", `Bearer ${a.token}`)
        .expect(200);
      await request(app)
        .post(`/api/matches/business/${b.businessId}/recompute`)
        .set("Authorization", `Bearer ${b.token}`)
        .expect(200);

      const res = await request(app)
        .get("/api/matches/investor/feed?minScore=60")
        .set("Authorization", `Bearer ${inv.token}`)
        .expect(200);

      expect(res.body.matches).toHaveLength(1);
      expect(res.body.matches[0].business.sector).toBe("SaaS");
    });

    it("excludes passed matches", async () => {
      const inv = await registerInvestor();
      const biz = await setupBusinessReady();

      await request(app)
        .post(`/api/matches/business/${biz.businessId}/recompute`)
        .set("Authorization", `Bearer ${biz.token}`)
        .expect(200);

      const [m] = await db.select().from(matches);
      await request(app)
        .post(`/api/matches/${m.id}/pass`)
        .set("Authorization", `Bearer ${inv.token}`)
        .expect(200);

      const res = await request(app)
        .get("/api/matches/investor/feed")
        .set("Authorization", `Bearer ${inv.token}`)
        .expect(200);

      expect(res.body.matches).toHaveLength(0);
    });
  });

  describe("GET /api/matches/business/:id/feed", () => {
    it("returns matches for the business", async () => {
      const biz = await setupBusinessReady();
      await registerInvestor();

      await request(app)
        .post(`/api/matches/business/${biz.businessId}/recompute`)
        .set("Authorization", `Bearer ${biz.token}`)
        .expect(200);

      const res = await request(app)
        .get(`/api/matches/business/${biz.businessId}/feed`)
        .set("Authorization", `Bearer ${biz.token}`)
        .expect(200);

      expect(res.body.matches).toHaveLength(1);
      expect(res.body.matches[0].investor.firmName).toBe("Test Capital");
    });

    it("403 for a business I don't own", async () => {
      const owner = await setupBusinessReady();
      const attacker = await registerBusiness();

      await request(app)
        .get(`/api/matches/business/${owner.businessId}/feed`)
        .set("Authorization", `Bearer ${attacker.token}`)
        .expect(403);
    });
  });

  describe("POST /api/matches/:id/shortlist", () => {
    it("marks the match as shortlisted", async () => {
      const inv = await registerInvestor();
      const biz = await setupBusinessReady();

      await request(app)
        .post(`/api/matches/business/${biz.businessId}/recompute`)
        .set("Authorization", `Bearer ${biz.token}`)
        .expect(200);

      const [m] = await db.select().from(matches);

      const res = await request(app)
        .post(`/api/matches/${m.id}/shortlist`)
        .set("Authorization", `Bearer ${inv.token}`)
        .expect(200);

      expect(res.body.match.status).toBe("shortlisted");
    });

    it("403 when I'm not part of the match", async () => {
      const inv1 = await registerInvestor();
      const biz = await setupBusinessReady();

      await request(app)
        .post(`/api/matches/business/${biz.businessId}/recompute`)
        .set("Authorization", `Bearer ${biz.token}`)
        .expect(200);

      const [m] = await db.select().from(matches);
      const outsider = await registerInvestor();

      await request(app)
        .post(`/api/matches/${m.id}/shortlist`)
        .set("Authorization", `Bearer ${outsider.token}`)
        .expect(403);
    });
  });
});