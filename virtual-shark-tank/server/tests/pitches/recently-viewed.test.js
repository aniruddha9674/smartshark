import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../src/app.js";
import { db } from "../../src/config/db.postgres.js";
import { users, events } from "../../src/models/postgres/index.js";

// Reuse the setupLivePitch helper style from tests/offers
const registerUser = async () => {
  const email = `t-${Date.now()}-${Math.random()}@example.com`;
  const res = await request(app)
    .post("/api/auth/register")
    .send({ name: "Test", email, password: "Password123" })
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
      sector: "SaaS", city: "Bangalore", description: "We do SaaS",
      fundingAsk: 5000000, yearsOperating: 3,
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
      title: "Seed",
      tagline: "Invest",
      shortPitch: "We do X",
      longSummary: "Long form",
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

describe("GET /api/pitches/recently-viewed", () => {
  beforeEach(async () => {
    await db.delete(events);
    await db.delete(users);
  });

  it("returns empty for a fresh user", async () => {
    const { token } = await registerUser();
    const res = await request(app)
      .get("/api/pitches/recently-viewed")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(res.body.pitches).toEqual([]);
  });

  it("returns a pitch the user just viewed", async () => {
    const { pitchId } = await setupLivePitch();
    const investor = await registerUser();

    // View the pitch (detail page)
    await request(app)
      .get(`/api/pitches/${pitchId}`)
      .set("Authorization", `Bearer ${investor.token}`)
      .expect(200);

    // Small wait so the event is committed
    await new Promise((r) => setTimeout(r, 50));

    const res = await request(app)
      .get("/api/pitches/recently-viewed")
      .set("Authorization", `Bearer ${investor.token}`)
      .expect(200);

    expect(res.body.pitches.length).toBe(1);
    expect(res.body.pitches[0].pitch.id).toBe(pitchId);
  });

  it("does not log a view when the owner reads their own pitch", async () => {
    const { owner, pitchId } = await setupLivePitch();

    await request(app)
      .get(`/api/pitches/${pitchId}`)
      .set("Authorization", `Bearer ${owner.token}`)
      .expect(200);

    await new Promise((r) => setTimeout(r, 50));

    const rows = await db.select().from(events);
    const views = rows.filter((r) => r.eventType === "pitch_viewed");
    expect(views.length).toBe(0);
  });
});