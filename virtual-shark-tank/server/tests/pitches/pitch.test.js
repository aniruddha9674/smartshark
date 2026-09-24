import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../src/app.js";
import { db } from "../../src/config/db.postgres.js";
import { users } from "../../src/models/postgres/index.js";

// ---- Helpers ----
const registerUser = async () => {
  const email = `t-${Date.now()}-${Math.random()}@example.com`;
  const res = await request(app)
    .post("/api/auth/register")
    .send({ name: "Test User", email, password: "Password123" })
    .expect(201);
  return { user: res.body.user, token: res.body.accessToken };
};

const createBusiness = async (token, { complete = false, ...overrides } = {}) => {
  const res = await request(app)
    .post("/api/businesses")
    .set("Authorization", `Bearer ${token}`)
    .send({ companyName: "Acme Pvt Ltd", ...overrides })
    .expect(201);
  const biz = res.body.business;

  if (complete) {
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

    await request(app)
      .post(`/api/businesses/${biz.id}/complete`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
  }

  return biz;
};

const validPayload = (businessId, overrides = {}) => ({
  businessId,
  title: "Seed Round 2026",
  tagline: "Invest in the future",
  shortPitch: "We help X do Y",
  longSummary: "Long form pitch text...",
  askAmount: 5000000,
  equityOffered: 8,
  stage: "mvp",
  revenueRange: "under_10L",
  ...overrides,
});

const createPitch = async (token, businessId, overrides = {}) => {
  const res = await request(app)
    .post("/api/pitches")
    .set("Authorization", `Bearer ${token}`)
    .send(validPayload(businessId, overrides))
    .expect(201);
  return res.body.pitch;
};

describe("Pitch endpoints", () => {
  beforeEach(async () => {
    await db.delete(users);
  });

  // ---------- POST /api/pitches ----------
  describe("POST /api/pitches", () => {
    it("creates a draft pitch for a business I own", async () => {
      const { token } = await registerUser();
      const biz = await createBusiness(token);

      const res = await request(app)
        .post("/api/pitches")
        .set("Authorization", `Bearer ${token}`)
        .send(validPayload(biz.id))
        .expect(201);

      expect(res.body.pitch.status).toBe("draft");
      expect(res.body.pitch.businessId).toBe(biz.id);
      expect(res.body.pitch.title).toBe("Seed Round 2026");
    });

    it("401 without auth", async () => {
      const { token } = await registerUser();
      const biz = await createBusiness(token);
      await request(app).post("/api/pitches").send(validPayload(biz.id)).expect(401);
    });

    it("400 with missing title", async () => {
      const { token } = await registerUser();
      const biz = await createBusiness(token);
      const { title, ...rest } = validPayload(biz.id);

      await request(app)
        .post("/api/pitches")
        .set("Authorization", `Bearer ${token}`)
        .send(rest)
        .expect(400);
    });

    it("403 when creating a pitch for a business I don't own", async () => {
      const owner = await registerUser();
      const attacker = await registerUser();
      const biz = await createBusiness(owner.token);

      await request(app)
        .post("/api/pitches")
        .set("Authorization", `Bearer ${attacker.token}`)
        .send(validPayload(biz.id))
        .expect(403);
    });

    it("404 for a nonexistent business", async () => {
      const { token } = await registerUser();
      const fake = "00000000-0000-0000-0000-000000000000";

      await request(app)
        .post("/api/pitches")
        .set("Authorization", `Bearer ${token}`)
        .send(validPayload(fake))
        .expect(404);
    });

    it("strips status from the body (cannot self-publish on create)", async () => {
      const { token } = await registerUser();
      const biz = await createBusiness(token);

      const res = await request(app)
        .post("/api/pitches")
        .set("Authorization", `Bearer ${token}`)
        .send({ ...validPayload(biz.id), status: "live" })
        .expect(201);

      expect(res.body.pitch.status).toBe("draft");
    });
  });

  // ---------- GET /api/pitches/me ----------
  describe("GET /api/pitches/me", () => {
    it("lists pitches for the given business", async () => {
      const { token } = await registerUser();
      const biz = await createBusiness(token);
      await createPitch(token, biz.id);
      await createPitch(token, biz.id, { title: "Second" });

      const res = await request(app)
        .get(`/api/pitches/me?businessId=${biz.id}`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(res.body.pitches.length).toBe(2);
    });

    it("400 without businessId query param", async () => {
      const { token } = await registerUser();
      await request(app)
        .get("/api/pitches/me")
        .set("Authorization", `Bearer ${token}`)
        .expect(400);
    });

    it("403 for a business I don't own", async () => {
      const owner = await registerUser();
      const attacker = await registerUser();
      const biz = await createBusiness(owner.token);

      await request(app)
        .get(`/api/pitches/me?businessId=${biz.id}`)
        .set("Authorization", `Bearer ${attacker.token}`)
        .expect(403);
    });

    it("does not leak other businesses' pitches", async () => {
      const a = await registerUser();
      const b = await registerUser();
      const bizA = await createBusiness(a.token, { companyName: "Alpha Co" });
const bizB = await createBusiness(b.token, { companyName: "Beta Co" });

      await createPitch(a.token, bizA.id);

      const res = await request(app)
        .get(`/api/pitches/me?businessId=${bizB.id}`)
        .set("Authorization", `Bearer ${b.token}`)
        .expect(200);

      expect(res.body.pitches.length).toBe(0);
    });
  });

  // ---------- GET /api/pitches/:id ----------
  describe("GET /api/pitches/:id", () => {
    it("owner can fetch their draft", async () => {
      const { token } = await registerUser();
      const biz = await createBusiness(token);
      const pitch = await createPitch(token, biz.id);

      const res = await request(app)
        .get(`/api/pitches/${pitch.id}`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
      expect(res.body.pitch.id).toBe(pitch.id);
    });

    it("non-owner gets 404 for a draft", async () => {
      const owner = await registerUser();
      const other = await registerUser();
      const biz = await createBusiness(owner.token);
      const pitch = await createPitch(owner.token, biz.id);

      await request(app)
        .get(`/api/pitches/${pitch.id}`)
        .set("Authorization", `Bearer ${other.token}`)
        .expect(404);
    });

    it("non-owner can fetch a live pitch", async () => {
      const owner = await registerUser();
      const investor = await registerUser();
      const biz = await createBusiness(owner.token, { complete: true });
      const pitch = await createPitch(owner.token, biz.id);
      await request(app)
        .post(`/api/pitches/${pitch.id}/publish`)
        .set("Authorization", `Bearer ${owner.token}`)
        .expect(200);

      await request(app)
        .get(`/api/pitches/${pitch.id}`)
        .set("Authorization", `Bearer ${investor.token}`)
        .expect(200);
    });
  });

  // ---------- PATCH /api/pitches/:id ----------
  describe("PATCH /api/pitches/:id", () => {
    it("updates a draft", async () => {
      const { token } = await registerUser();
      const biz = await createBusiness(token);
      const pitch = await createPitch(token, biz.id);

      const res = await request(app)
        .patch(`/api/pitches/${pitch.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ tagline: "Updated" })
        .expect(200);
      expect(res.body.pitch.tagline).toBe("Updated");
    });

    it("recomputes valuation on ask change", async () => {
      const { token } = await registerUser();
      const biz = await createBusiness(token);
      const pitch = await createPitch(token, biz.id);

      const res = await request(app)
        .patch(`/api/pitches/${pitch.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ askAmount: 10000000 })
        .expect(200);
      expect(res.body.pitch.valuation).toBe("125000000.00");
    });

    it("403 for non-owner", async () => {
      const owner = await registerUser();
      const attacker = await registerUser();
      const biz = await createBusiness(owner.token);
      const pitch = await createPitch(owner.token, biz.id);

      await request(app)
        .patch(`/api/pitches/${pitch.id}`)
        .set("Authorization", `Bearer ${attacker.token}`)
        .send({ tagline: "Hijacked" })
        .expect(403);
    });

    it("400 for empty body", async () => {
      const { token } = await registerUser();
      const biz = await createBusiness(token);
      const pitch = await createPitch(token, biz.id);

      await request(app)
        .patch(`/api/pitches/${pitch.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({})
        .expect(400);
    });

    it("400 when editing a live pitch", async () => {
      const { token } = await registerUser();
      const biz = await createBusiness(token, { complete: true });
      const pitch = await createPitch(token, biz.id);
      await request(app)
        .post(`/api/pitches/${pitch.id}/publish`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      await request(app)
        .patch(`/api/pitches/${pitch.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ tagline: "Changed" })
        .expect(400);
    });

    it("strips status from update body", async () => {
      const { token } = await registerUser();
      const biz = await createBusiness(token);
      const pitch = await createPitch(token, biz.id);

      const res = await request(app)
        .patch(`/api/pitches/${pitch.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ title: "Renamed", status: "live" })
        .expect(200);
      expect(res.body.pitch.status).toBe("draft");
    });
  });

  // ---------- POST /api/pitches/:id/publish ----------
  describe("POST /api/pitches/:id/publish", () => {
    it("publishes when business profile complete and fields filled", async () => {
      const { token } = await registerUser();
      const biz = await createBusiness(token, { complete: true });
      const pitch = await createPitch(token, biz.id);

      const res = await request(app)
        .post(`/api/pitches/${pitch.id}/publish`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
      expect(res.body.pitch.status).toBe("live");
    });

    it("400 when business profile is incomplete", async () => {
      const { token } = await registerUser();
      const biz = await createBusiness(token, { complete: false });
      const pitch = await createPitch(token, biz.id);

      await request(app)
        .post(`/api/pitches/${pitch.id}/publish`)
        .set("Authorization", `Bearer ${token}`)
        .expect(400);
    });

    it("400 for missing required fields", async () => {
      const { token } = await registerUser();
      const biz = await createBusiness(token, { complete: true });

      const res = await request(app)
        .post("/api/pitches")
        .set("Authorization", `Bearer ${token}`)
        .send({ businessId: biz.id, title: "Bare", askAmount: 1000000, equityOffered: 5 })
        .expect(201);

      await request(app)
        .post(`/api/pitches/${res.body.pitch.id}/publish`)
        .set("Authorization", `Bearer ${token}`)
        .expect(400);
    });

    it("403 for non-owner", async () => {
      const owner = await registerUser();
      const attacker = await registerUser();
      const biz = await createBusiness(owner.token, { complete: true });
      const pitch = await createPitch(owner.token, biz.id);

      await request(app)
        .post(`/api/pitches/${pitch.id}/publish`)
        .set("Authorization", `Bearer ${attacker.token}`)
        .expect(403);
    });

    it("409 for a second live pitch on the same business", async () => {
      const { token } = await registerUser();
      const biz = await createBusiness(token, { complete: true });

      const first = await createPitch(token, biz.id);
      await request(app)
        .post(`/api/pitches/${first.id}/publish`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      const second = await createPitch(token, biz.id, { title: "Second" });

      await request(app)
        .post(`/api/pitches/${second.id}/publish`)
        .set("Authorization", `Bearer ${token}`)
        .expect(409);
    });

    it("allows publishing on two different businesses for the same user", async () => {
      const { token } = await registerUser();
      const bizA = await createBusiness(token, { complete: true, companyName: "Alpha Co" });
const bizB = await createBusiness(token, { complete: true, companyName: "Beta Co" });

      const p1 = await createPitch(token, bizA.id);
      const p2 = await createPitch(token, bizB.id, { title: "Second" });

      await request(app)
        .post(`/api/pitches/${p1.id}/publish`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
      await request(app)
        .post(`/api/pitches/${p2.id}/publish`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
    });
  });

  // ---------- POST /api/pitches/:id/close ----------
  describe("POST /api/pitches/:id/close", () => {
    it("closes a live pitch", async () => {
      const { token } = await registerUser();
      const biz = await createBusiness(token, { complete: true });
      const pitch = await createPitch(token, biz.id);
      await request(app)
        .post(`/api/pitches/${pitch.id}/publish`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      const res = await request(app)
        .post(`/api/pitches/${pitch.id}/close`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
      expect(res.body.pitch.status).toBe("closed");
    });

    it("400 for closing a draft", async () => {
      const { token } = await registerUser();
      const biz = await createBusiness(token);
      const pitch = await createPitch(token, biz.id);

      await request(app)
        .post(`/api/pitches/${pitch.id}/close`)
        .set("Authorization", `Bearer ${token}`)
        .expect(400);
    });
  });

  // ---------- DELETE /api/pitches/:id ----------
  describe("DELETE /api/pitches/:id", () => {
    it("deletes a draft", async () => {
      const { token } = await registerUser();
      const biz = await createBusiness(token);
      const pitch = await createPitch(token, biz.id);

      await request(app)
        .delete(`/api/pitches/${pitch.id}`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      await request(app)
        .get(`/api/pitches/${pitch.id}`)
        .set("Authorization", `Bearer ${token}`)
        .expect(404);
    });

    it("400 for deleting a live pitch", async () => {
      const { token } = await registerUser();
      const biz = await createBusiness(token, { complete: true });
      const pitch = await createPitch(token, biz.id);
      await request(app)
        .post(`/api/pitches/${pitch.id}/publish`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      await request(app)
        .delete(`/api/pitches/${pitch.id}`)
        .set("Authorization", `Bearer ${token}`)
        .expect(400);
    });

    it("403 for non-owner", async () => {
      const owner = await registerUser();
      const attacker = await registerUser();
      const biz = await createBusiness(owner.token);
      const pitch = await createPitch(owner.token, biz.id);

      await request(app)
        .delete(`/api/pitches/${pitch.id}`)
        .set("Authorization", `Bearer ${attacker.token}`)
        .expect(403);
    });
  });

  // ---------- GET /api/pitches (investor feed) ----------
  describe("GET /api/pitches", () => {
    it("returns only live pitches", async () => {
      const owner = await registerUser();
      const biz1 = await createBusiness(owner.token, { complete: true, companyName: "Alpha Co" });
const biz2 = await createBusiness(owner.token, { complete: true, companyName: "Beta Co" });

      await createPitch(owner.token, biz1.id); // stays draft
      const live = await createPitch(owner.token, biz2.id, { title: "Live" });
      await request(app)
        .post(`/api/pitches/${live.id}/publish`)
        .set("Authorization", `Bearer ${owner.token}`)
        .expect(200);

      const investor = await registerUser();
      const res = await request(app)
        .get("/api/pitches")
        .set("Authorization", `Bearer ${investor.token}`)
        .expect(200);

      expect(res.body.pitches.length).toBe(1);
      expect(res.body.pitches[0].title).toBe("Live");
    });

    it("filters by stage", async () => {
      const owner = await registerUser();
      const biz = await createBusiness(owner.token, { complete: true });
      const pitch = await createPitch(owner.token, biz.id, { stage: "growth" });
      await request(app)
        .post(`/api/pitches/${pitch.id}/publish`)
        .set("Authorization", `Bearer ${owner.token}`)
        .expect(200);

      const investor = await registerUser();
      const res = await request(app)
        .get("/api/pitches?stage=growth")
        .set("Authorization", `Bearer ${investor.token}`)
        .expect(200);
      expect(res.body.pitches.length).toBe(1);
    });

    it("filters by businessId", async () => {
      const owner = await registerUser();
     const biz1 = await createBusiness(owner.token, { complete: true, companyName: "Alpha Co" });
const biz2 = await createBusiness(owner.token, { complete: true, companyName: "Beta Co" });

      const p1 = await createPitch(owner.token, biz1.id);
      const p2 = await createPitch(owner.token, biz2.id, { title: "Second Pitch" });
      await request(app)
        .post(`/api/pitches/${p1.id}/publish`)
        .set("Authorization", `Bearer ${owner.token}`)
        .expect(200);
      await request(app)
        .post(`/api/pitches/${p2.id}/publish`)
        .set("Authorization", `Bearer ${owner.token}`)
        .expect(200);

      const investor = await registerUser();
      const res = await request(app)
        .get(`/api/pitches?businessId=${biz1.id}`)
        .set("Authorization", `Bearer ${investor.token}`)
        .expect(200);
      expect(res.body.pitches.length).toBe(1);
    });
  });
});