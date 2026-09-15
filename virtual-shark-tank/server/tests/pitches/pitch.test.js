import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../src/app.js";
import { db } from "../../src/config/db.postgres.js";
import { users, businessProfiles } from "../../src/models/postgres/index.js";

// ---- Helpers ----
const registerUser = async (role = "business") => {
  const email = `t-${role}-${Date.now()}-${Math.random()}@example.com`;
  const res = await request(app)
    .post("/api/auth/register")
    .send({ name: "Test", email, password: "Password123", role })
    .expect(201);
  return { user: res.body.user, token: res.body.accessToken };
};

const createBusiness = async (complete = false) => {
  const { user, token } = await registerUser("business");
  await db.insert(businessProfiles).values({ userId: user.id });
  if (complete) {
    await request(app)
      .patch("/api/business/me")
      .set("Authorization", `Bearer ${token}`)
      .send({
        companyName: "Acme",
        sector: "SaaS",
        city: "Bangalore",
        description: "We do SaaS",
        fundingAsk: 5000000,
        yearsOperating: 3,
      })
      .expect(200);
    await request(app)
      .post("/api/business/complete")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
  }
  return { user, token };
};

const validPayload = (overrides = {}) => ({
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

describe("Pitch endpoints", () => {
  beforeEach(async () => {
    await db.delete(users);
  });

  // ---------- POST / ----------
  describe("POST /api/pitches", () => {
    it("creates a draft pitch", async () => {
      const { token } = await createBusiness();
      const res = await request(app)
        .post("/api/pitches")
        .set("Authorization", `Bearer ${token}`)
        .send(validPayload())
        .expect(201);

      expect(res.body.pitch.status).toBe("draft");
      expect(res.body.pitch.title).toBe("Seed Round 2026");
    });

    it("rejects investors (403)", async () => {
      const { token } = await registerUser("investor");
      await request(app)
        .post("/api/pitches")
        .set("Authorization", `Bearer ${token}`)
        .send(validPayload())
        .expect(403);
    });

    it("rejects unauthenticated (401)", async () => {
      await request(app).post("/api/pitches").send(validPayload()).expect(401);
    });

    it("rejects missing title (400)", async () => {
      const { token } = await createBusiness();
      const { title, ...rest } = validPayload();
      await request(app)
        .post("/api/pitches")
        .set("Authorization", `Bearer ${token}`)
        .send(rest)
        .expect(400);
    });

    it("strips status field (cannot self-publish on create)", async () => {
      const { token } = await createBusiness();
      const res = await request(app)
        .post("/api/pitches")
        .set("Authorization", `Bearer ${token}`)
        .send({ ...validPayload(), status: "live" })
        .expect(201);
      expect(res.body.pitch.status).toBe("draft");
    });
  });

  // ---------- GET /me ----------
  describe("GET /api/pitches/me", () => {
    it("lists own pitches", async () => {
      const { token } = await createBusiness();
      await request(app)
        .post("/api/pitches")
        .set("Authorization", `Bearer ${token}`)
        .send(validPayload())
        .expect(201);
      await request(app)
        .post("/api/pitches")
        .set("Authorization", `Bearer ${token}`)
        .send(validPayload({ title: "Second" }))
        .expect(201);

      const res = await request(app)
        .get("/api/pitches/me")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
      expect(res.body.pitches.length).toBe(2);
    });

    it("does not leak other businesses' pitches", async () => {
      const a = await createBusiness();
      const b = await createBusiness();
      await request(app)
        .post("/api/pitches")
        .set("Authorization", `Bearer ${a.token}`)
        .send(validPayload())
        .expect(201);

      const res = await request(app)
        .get("/api/pitches/me")
        .set("Authorization", `Bearer ${b.token}`)
        .expect(200);
      expect(res.body.pitches.length).toBe(0);
    });
  });

  // ---------- GET /:id ----------
  describe("GET /api/pitches/:id", () => {
    it("owner can fetch their draft", async () => {
      const { token } = await createBusiness();
      const created = await request(app)
        .post("/api/pitches")
        .set("Authorization", `Bearer ${token}`)
        .send(validPayload())
        .expect(201);

      const res = await request(app)
        .get(`/api/pitches/${created.body.pitch.id}`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
      expect(res.body.pitch.id).toBe(created.body.pitch.id);
    });

    it("non-owner gets 404 for a draft", async () => {
      const owner = await createBusiness();
      const other = await createBusiness();
      const created = await request(app)
        .post("/api/pitches")
        .set("Authorization", `Bearer ${owner.token}`)
        .send(validPayload())
        .expect(201);

      await request(app)
        .get(`/api/pitches/${created.body.pitch.id}`)
        .set("Authorization", `Bearer ${other.token}`)
        .expect(404);
    });

    it("non-owner can fetch a live pitch", async () => {
      const owner = await createBusiness(true);
      const investor = await registerUser("investor");
      const created = await request(app)
        .post("/api/pitches")
        .set("Authorization", `Bearer ${owner.token}`)
        .send(validPayload())
        .expect(201);
      await request(app)
        .post(`/api/pitches/${created.body.pitch.id}/publish`)
        .set("Authorization", `Bearer ${owner.token}`)
        .expect(200);

      await request(app)
        .get(`/api/pitches/${created.body.pitch.id}`)
        .set("Authorization", `Bearer ${investor.token}`)
        .expect(200);
    });
  });

  // ---------- PATCH /:id ----------
  describe("PATCH /api/pitches/:id", () => {
    it("updates own draft", async () => {
      const { token } = await createBusiness();
      const created = await request(app)
        .post("/api/pitches")
        .set("Authorization", `Bearer ${token}`)
        .send(validPayload())
        .expect(201);

      const res = await request(app)
        .patch(`/api/pitches/${created.body.pitch.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ tagline: "Updated" })
        .expect(200);
      expect(res.body.pitch.tagline).toBe("Updated");
    });

    it("rejects updating someone else's pitch (403)", async () => {
      const owner = await createBusiness();
      const attacker = await createBusiness();
      const created = await request(app)
        .post("/api/pitches")
        .set("Authorization", `Bearer ${owner.token}`)
        .send(validPayload())
        .expect(201);

      await request(app)
        .patch(`/api/pitches/${created.body.pitch.id}`)
        .set("Authorization", `Bearer ${attacker.token}`)
        .send({ tagline: "Hijacked" })
        .expect(403);
    });

    it("rejects editing a live pitch", async () => {
      const { token } = await createBusiness(true);
      const created = await request(app)
        .post("/api/pitches")
        .set("Authorization", `Bearer ${token}`)
        .send(validPayload())
        .expect(201);
      await request(app)
        .post(`/api/pitches/${created.body.pitch.id}/publish`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      await request(app)
        .patch(`/api/pitches/${created.body.pitch.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ tagline: "Changed" })
        .expect(400);
    });

    it("rejects empty body", async () => {
      const { token } = await createBusiness();
      const created = await request(app)
        .post("/api/pitches")
        .set("Authorization", `Bearer ${token}`)
        .send(validPayload())
        .expect(201);

      await request(app)
        .patch(`/api/pitches/${created.body.pitch.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({})
        .expect(400);
    });

    it("strips status from update body", async () => {
      const { token } = await createBusiness();
      const created = await request(app)
        .post("/api/pitches")
        .set("Authorization", `Bearer ${token}`)
        .send(validPayload())
        .expect(201);

      const res = await request(app)
        .patch(`/api/pitches/${created.body.pitch.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ title: "Renamed", status: "live" })
        .expect(200);
      expect(res.body.pitch.status).toBe("draft");
    });
  });

  // ---------- POST /:id/publish ----------
  describe("POST /api/pitches/:id/publish", () => {
    it("publishes when profile is complete and pitch is filled", async () => {
      const { token } = await createBusiness(true);
      const created = await request(app)
        .post("/api/pitches")
        .set("Authorization", `Bearer ${token}`)
        .send(validPayload())
        .expect(201);

      const res = await request(app)
        .post(`/api/pitches/${created.body.pitch.id}/publish`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
      expect(res.body.pitch.status).toBe("live");
    });

    it("rejects publishing when profile is incomplete (400)", async () => {
      const { token } = await createBusiness(false);
      const created = await request(app)
        .post("/api/pitches")
        .set("Authorization", `Bearer ${token}`)
        .send(validPayload())
        .expect(201);

      await request(app)
        .post(`/api/pitches/${created.body.pitch.id}/publish`)
        .set("Authorization", `Bearer ${token}`)
        .expect(400);
    });

    it("rejects publishing with missing required fields (400)", async () => {
      const { token } = await createBusiness(true);
      const created = await request(app)
        .post("/api/pitches")
        .set("Authorization", `Bearer ${token}`)
        .send({ title: "Bare", askAmount: 1000000, equityOffered: 5 })
        .expect(201);

      await request(app)
        .post(`/api/pitches/${created.body.pitch.id}/publish`)
        .set("Authorization", `Bearer ${token}`)
        .expect(400);
    });

    it("rejects a second live pitch (409)", async () => {
      const { token } = await createBusiness(true);
      const first = await request(app)
        .post("/api/pitches")
        .set("Authorization", `Bearer ${token}`)
        .send(validPayload())
        .expect(201);
      await request(app)
        .post(`/api/pitches/${first.body.pitch.id}/publish`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      const second = await request(app)
        .post("/api/pitches")
        .set("Authorization", `Bearer ${token}`)
        .send(validPayload({ title: "Second" }))
        .expect(201);

      await request(app)
        .post(`/api/pitches/${second.body.pitch.id}/publish`)
        .set("Authorization", `Bearer ${token}`)
        .expect(409);
    });
  });

  // ---------- POST /:id/close ----------
  describe("POST /api/pitches/:id/close", () => {
    it("closes a live pitch", async () => {
      const { token } = await createBusiness(true);
      const created = await request(app)
        .post("/api/pitches")
        .set("Authorization", `Bearer ${token}`)
        .send(validPayload())
        .expect(201);
      await request(app)
        .post(`/api/pitches/${created.body.pitch.id}/publish`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      const res = await request(app)
        .post(`/api/pitches/${created.body.pitch.id}/close`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
      expect(res.body.pitch.status).toBe("closed");
    });

    it("rejects closing a draft (400)", async () => {
      const { token } = await createBusiness();
      const created = await request(app)
        .post("/api/pitches")
        .set("Authorization", `Bearer ${token}`)
        .send(validPayload())
        .expect(201);

      await request(app)
        .post(`/api/pitches/${created.body.pitch.id}/close`)
        .set("Authorization", `Bearer ${token}`)
        .expect(400);
    });
  });

  // ---------- DELETE /:id ----------
  describe("DELETE /api/pitches/:id", () => {
    it("deletes a draft", async () => {
      const { token } = await createBusiness();
      const created = await request(app)
        .post("/api/pitches")
        .set("Authorization", `Bearer ${token}`)
        .send(validPayload())
        .expect(201);

      await request(app)
        .delete(`/api/pitches/${created.body.pitch.id}`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      await request(app)
        .get(`/api/pitches/${created.body.pitch.id}`)
        .set("Authorization", `Bearer ${token}`)
        .expect(404);
    });

    it("rejects deleting a live pitch (400)", async () => {
      const { token } = await createBusiness(true);
      const created = await request(app)
        .post("/api/pitches")
        .set("Authorization", `Bearer ${token}`)
        .send(validPayload())
        .expect(201);
      await request(app)
        .post(`/api/pitches/${created.body.pitch.id}/publish`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      await request(app)
        .delete(`/api/pitches/${created.body.pitch.id}`)
        .set("Authorization", `Bearer ${token}`)
        .expect(400);
    });
  });

  // ---------- GET / (investor feed base) ----------
  describe("GET /api/pitches", () => {
    it("returns only live pitches", async () => {
      const biz1 = await createBusiness(true);
      const biz2 = await createBusiness(true);
      const draft = await request(app)
        .post("/api/pitches")
        .set("Authorization", `Bearer ${biz1.token}`)
        .send(validPayload())
        .expect(201); // stays draft

      const live = await request(app)
        .post("/api/pitches")
        .set("Authorization", `Bearer ${biz2.token}`)
        .send(validPayload({ title: "Live Pitch" }))
        .expect(201);
      await request(app)
        .post(`/api/pitches/${live.body.pitch.id}/publish`)
        .set("Authorization", `Bearer ${biz2.token}`)
        .expect(200);

      const investor = await registerUser("investor");
      const res = await request(app)
        .get("/api/pitches")
        .set("Authorization", `Bearer ${investor.token}`)
        .expect(200);

      expect(res.body.pitches.length).toBe(1);
      expect(res.body.pitches[0].title).toBe("Live Pitch");
    });

    it("filters by stage", async () => {
      const biz = await createBusiness(true);
      const p = await request(app)
        .post("/api/pitches")
        .set("Authorization", `Bearer ${biz.token}`)
        .send(validPayload({ stage: "growth" }))
        .expect(201);
      await request(app)
        .post(`/api/pitches/${p.body.pitch.id}/publish`)
        .set("Authorization", `Bearer ${biz.token}`)
        .expect(200);

      const investor = await registerUser("investor");
      const res = await request(app)
        .get("/api/pitches?stage=growth")
        .set("Authorization", `Bearer ${investor.token}`)
        .expect(200);

      expect(res.body.pitches.length).toBe(1);
    });
  });
});