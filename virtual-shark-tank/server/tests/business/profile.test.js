import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../src/app.js";
import { db } from "../../src/config/db.postgres.js";
import { users, businessProfiles } from "../../src/models/postgres/index.js";

// ---- Helpers ----
const registerAndLogin = async (role = "business", emailSuffix = "") => {
  const email = `test-${role}-${Date.now()}-${Math.random()}${emailSuffix}@example.com`;
  const res = await request(app)
    .post("/api/auth/register")
    .send({
      name: "Test User",
      email,
      password: "Password123",
      role,
    })
    .expect(201);

  return {
    user: res.body.user,
    token: res.body.accessToken,
    cookie: res.headers["set-cookie"].find((c) => c.startsWith("refreshToken=")),
  };
};

// Create a business user + a corresponding business_profiles row
const createBusinessUser = async () => {
  const { user, token } = await registerAndLogin("business");
  await db.insert(businessProfiles).values({ userId: user.id });
  return { user, token };
};

describe("Business profile endpoints", () => {
  beforeEach(async () => {
    await db.delete(users);
  });

  // ---------- Auth gate ----------
  describe("Auth / role gate", () => {
    it("rejects GET /api/business/me without a token", async () => {
      const res = await request(app).get("/api/business/me").expect(401);
      expect(res.body.error).toBe("No token provided");
    });

    it("rejects GET /api/business/me for an investor", async () => {
      const { token } = await registerAndLogin("investor");
      const res = await request(app)
        .get("/api/business/me")
        .set("Authorization", `Bearer ${token}`)
        .expect(403);
      expect(res.body.error).toBe("Insufficient permissions");
    });
  });

  // ---------- GET /me ----------
  describe("GET /api/business/me", () => {
    it("returns the profile of the logged-in business", async () => {
      const { user, token } = await createBusinessUser();
      const res = await request(app)
        .get("/api/business/me")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(res.body.profile).toBeDefined();
      expect(res.body.profile.userId).toBe(user.id);
      expect(res.body.profile.companyName).toBeNull();
    });
  });

  // ---------- PATCH /me ----------
  describe("PATCH /api/business/me", () => {
    it("updates a single field", async () => {
      const { token } = await createBusinessUser();
      const res = await request(app)
        .patch("/api/business/me")
        .set("Authorization", `Bearer ${token}`)
        .send({ companyName: "Acme Pvt Ltd" })
        .expect(200);

      expect(res.body.profile.companyName).toBe("Acme Pvt Ltd");
    });

    it("updates multiple fields at once", async () => {
      const { token } = await createBusinessUser();
      const res = await request(app)
        .patch("/api/business/me")
        .set("Authorization", `Bearer ${token}`)
        .send({ companyName: "Acme", city: "Mumbai", fundingAsk: 5000000 })
        .expect(200);

      expect(res.body.profile.companyName).toBe("Acme");
      expect(res.body.profile.city).toBe("Mumbai");
    });

    it("returns 400 for an empty body", async () => {
      const { token } = await createBusinessUser();
      const res = await request(app)
        .patch("/api/business/me")
        .set("Authorization", `Bearer ${token}`)
        .send({})
        .expect(400);

      expect(res.body.error).toBe("Validation failed");
    });

    it("returns 400 for an invalid field value", async () => {
      const { token } = await createBusinessUser();
      const res = await request(app)
        .patch("/api/business/me")
        .set("Authorization", `Bearer ${token}`)
        .send({ fundingAsk: -100 })
        .expect(400);

      expect(res.body.error).toBe("Validation failed");
    });

    it("strips unknown fields from the payload (no privilege escalation)", async () => {
      const { token } = await createBusinessUser();
      const res = await request(app)
        .patch("/api/business/me")
        .set("Authorization", `Bearer ${token}`)
        .send({
          companyName: "Acme",
          verificationTier: "verified",   // attacker attempt
          userId: "some-other-id",         // attacker attempt
        })
        .expect(200);

      expect(res.body.profile.verificationTier).toBe("unverified"); // default untouched
      expect(res.body.profile.userId).not.toBe("some-other-id");
    });

    it("coerces string numbers to numeric fields", async () => {
      const { token } = await createBusinessUser();
      const res = await request(app)
        .patch("/api/business/me")
        .set("Authorization", `Bearer ${token}`)
        .send({ fundingAsk: "5000000" })
        .expect(200);

      expect(res.body.profile.fundingAsk).toBe("5000000");
    });

    it("only updates the logged-in user's profile (no cross-user writes)", async () => {
      const a = await createBusinessUser();
      const b = await createBusinessUser();

      await request(app)
        .patch("/api/business/me")
        .set("Authorization", `Bearer ${a.token}`)
        .send({ companyName: "A's Company" })
        .expect(200);

      // Fetch b's profile — must be untouched
      const bRes = await request(app)
        .get("/api/business/me")
        .set("Authorization", `Bearer ${b.token}`)
        .expect(200);

      expect(bRes.body.profile.companyName).toBeNull();
    });
  });

  // ---------- POST /complete ----------
  describe("POST /api/business/complete", () => {
    it("returns 400 with missing fields when profile is empty", async () => {
      const { token } = await createBusinessUser();
      const res = await request(app)
        .post("/api/business/complete")
        .set("Authorization", `Bearer ${token}`)
        .expect(400);

      expect(res.body.error).toBe("Profile incomplete");
      expect(res.body.details.missingFields).toContain("companyName");
      expect(res.body.details.missingFields.length).toBe(6);
    });

    it("returns 400 when only some fields are filled", async () => {
      const { token } = await createBusinessUser();
      await request(app)
        .patch("/api/business/me")
        .set("Authorization", `Bearer ${token}`)
        .send({
          companyName: "Acme",
          sector: "SaaS",
          city: "Bangalore",
          description: "We do SaaS",
          fundingAsk: 5000000,
        })
        .expect(200);

      const res = await request(app)
        .post("/api/business/complete")
        .set("Authorization", `Bearer ${token}`)
        .expect(400);

      expect(res.body.details.missingFields).toEqual(["yearsOperating"]);
    });

    it("returns 200 and sets isProfileComplete when all required fields are present", async () => {
      const { user, token } = await createBusinessUser();
      await request(app)
        .patch("/api/business/me")
        .set("Authorization", `Bearer ${token}`)
        .send({
          companyName: "Acme",
          sector: "SaaS",
          city: "Bangalore",
          description: "We do SaaS things",
          fundingAsk: 5000000,
          yearsOperating: 3,
        })
        .expect(200);

      const res = await request(app)
        .post("/api/business/complete")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(res.body.isProfileComplete).toBe(true);

      // Verify on /me
      const me = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(me.body.user.isProfileComplete).toBe(true);
    });
  });

  // ---------- GET /history ----------
  describe("GET /api/business/history", () => {
    it("returns empty array when no edits", async () => {
      const { token } = await createBusinessUser();
      const res = await request(app)
        .get("/api/business/history")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(res.body.history).toEqual([]);
    });

    it("returns edit history newest first", async () => {
      const { token } = await createBusinessUser();

      await request(app)
        .patch("/api/business/me")
        .set("Authorization", `Bearer ${token}`)
        .send({ companyName: "First Name" })
        .expect(200);

      await new Promise((r) => setTimeout(r, 50));

      await request(app)
        .patch("/api/business/me")
        .set("Authorization", `Bearer ${token}`)
        .send({ companyName: "Second Name" })
        .expect(200);

      const res = await request(app)
        .get("/api/business/history")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(res.body.history.length).toBe(2);
      expect(res.body.history[0].newValue).toBe("Second Name");
      expect(res.body.history[0].fieldName).toBe("companyName");
    });
  });
});