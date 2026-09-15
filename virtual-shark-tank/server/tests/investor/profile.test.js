import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../src/app.js";
import { db } from "../../src/config/db.postgres.js";
import { users, investorProfiles } from "../../src/models/postgres/index.js";

const registerAndLogin = async (role = "investor") => {
  const email = `test-${role}-${Date.now()}-${Math.random()}@example.com`;
  const res = await request(app)
    .post("/api/auth/register")
    .send({ name: "Test", email, password: "Password123", role })
    .expect(201);
  return { user: res.body.user, token: res.body.accessToken };
};

const createInvestorUser = async () => {
  const { user, token } = await registerAndLogin("investor");
  await db.insert(investorProfiles).values({ userId: user.id });
  return { user, token };
};

describe("Investor profile endpoints", () => {
  beforeEach(async () => {
    await db.delete(users);
  });

  describe("Auth / role gate", () => {
    it("401 without token", async () => {
      await request(app).get("/api/investor/me").expect(401);
    });

    it("403 for a business user", async () => {
      const { token } = await registerAndLogin("business");
      await request(app)
        .get("/api/investor/me")
        .set("Authorization", `Bearer ${token}`)
        .expect(403);
    });
  });

  describe("GET /me", () => {
    it("returns the investor's profile", async () => {
      const { user, token } = await createInvestorUser();
      const res = await request(app)
        .get("/api/investor/me")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
      expect(res.body.profile.userId).toBe(user.id);
    });
  });

  describe("PATCH /me", () => {
    it("updates a single field", async () => {
      const { token } = await createInvestorUser();
      const res = await request(app)
        .patch("/api/investor/me")
        .set("Authorization", `Bearer ${token}`)
        .send({ firmName: "Peak Ventures" })
        .expect(200);
      expect(res.body.profile.firmName).toBe("Peak Ventures");
    });

    it("400 for empty body", async () => {
      const { token } = await createInvestorUser();
      const res = await request(app)
        .patch("/api/investor/me")
        .set("Authorization", `Bearer ${token}`)
        .send({})
        .expect(400);
      expect(res.body.error).toBe("Validation failed");
    });

    it("400 for min > max", async () => {
      const { token } = await createInvestorUser();
      await request(app)
        .patch("/api/investor/me")
        .set("Authorization", `Bearer ${token}`)
        .send({ minTicketSize: 5000000, maxTicketSize: 500000 })
        .expect(400);
    });

    it("strips isIdentityVerified (no self-verification)", async () => {
      const { token } = await createInvestorUser();
      const res = await request(app)
        .patch("/api/investor/me")
        .set("Authorization", `Bearer ${token}`)
        .send({ firmName: "Peak", isIdentityVerified: true })
        .expect(200);
      expect(res.body.profile.isIdentityVerified).toBe(false);
    });

    it("only updates own profile (no cross-user writes)", async () => {
      const a = await createInvestorUser();
      const b = await createInvestorUser();

      await request(app)
        .patch("/api/investor/me")
        .set("Authorization", `Bearer ${a.token}`)
        .send({ firmName: "A's Firm" })
        .expect(200);

      const bRes = await request(app)
        .get("/api/investor/me")
        .set("Authorization", `Bearer ${b.token}`)
        .expect(200);
      expect(bRes.body.profile.firmName).toBeNull();
    });
  });

  describe("POST /complete", () => {
    it("400 with all missing fields when empty", async () => {
      const { token } = await createInvestorUser();
      const res = await request(app)
        .post("/api/investor/complete")
        .set("Authorization", `Bearer ${token}`)
        .expect(400);
      expect(res.body.details.missingFields.length).toBe(5);
    });

    it("200 and flips isProfileComplete when complete", async () => {
      const { token } = await createInvestorUser();
      await request(app)
        .patch("/api/investor/me")
        .set("Authorization", `Bearer ${token}`)
        .send({
          firmName: "Peak",
          investmentFocus: "SaaS",
          preferredGeography: "India",
          minTicketSize: 500000,
          maxTicketSize: 5000000,
        })
        .expect(200);

      const res = await request(app)
        .post("/api/investor/complete")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
      expect(res.body.isProfileComplete).toBe(true);

      const me = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
      expect(me.body.user.isProfileComplete).toBe(true);
    });
  });
});