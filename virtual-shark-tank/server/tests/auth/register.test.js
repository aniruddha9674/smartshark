import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../src/app.js";
import { db } from "../../src/config/db.postgres.js";
import { users } from "../../src/models/postgres/index.js";

const validPayload = {
  name: "Alice Sharma",
  email: "alice@example.com",
  password: "Password123",
};

describe("POST /api/auth/register", () => {
  beforeEach(async () => {
    // Clean slate for each test
    await db.delete(users);
  });

  it("returns 201 with user and accessToken for a valid payload", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send(validPayload)
      .expect(201);

    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe("alice@example.com");
    expect(res.body.user.name).toBe("Alice Sharma");
    expect(res.body.user.capabilities).toBeDefined();
expect(res.body.user.capabilities.hasBusiness).toBe(false);
expect(res.body.user.capabilities.isInvestor).toBe(false);
    expect(res.body.accessToken).toBeDefined();
    expect(typeof res.body.accessToken).toBe("string");
  });

  it("never returns the passwordHash", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send(validPayload)
      .expect(201);

    expect(res.body.user.passwordHash).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain("$2b$");
  });

  it("sets an httpOnly refresh cookie", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send(validPayload)
      .expect(201);

    const cookies = res.headers["set-cookie"];
    expect(cookies).toBeDefined();

    const refreshCookie = cookies.find((c) => c.startsWith("refreshToken="));
    expect(refreshCookie).toBeDefined();
    expect(refreshCookie).toMatch(/HttpOnly/i);
    expect(refreshCookie).toMatch(/SameSite=Strict/i);
    expect(refreshCookie).toMatch(/Path=\/api\/auth/);
  });

  it("defaults new users to unverified and active", async () => {
  const res = await request(app)
    .post("/api/auth/register")
    .send(validPayload)
    .expect(201);

  expect(res.body.user.isVerified).toBe(false);
  expect(res.body.user.isActive).toBe(true);
  expect(res.body.user.isAdmin).toBe(false);
  // isProfileComplete removed — now per-business
  expect(res.body.user.capabilities).toBeDefined();
});

  it("returns 409 when the email already exists", async () => {
    await request(app).post("/api/auth/register").send(validPayload).expect(201);

    const res = await request(app)
      .post("/api/auth/register")
      .send(validPayload)
      .expect(409);

    expect(res.body.error).toBe("Email already in use");
  });

  it("treats emails as case-insensitive for duplicates", async () => {
    await request(app).post("/api/auth/register").send(validPayload).expect(201);

    await request(app)
      .post("/api/auth/register")
      .send({ ...validPayload, email: "ALICE@EXAMPLE.COM" })
      .expect(409);
  });

  it("returns 400 with details for invalid email", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ ...validPayload, email: "not-an-email" })
      .expect(400);

    expect(res.body.error).toBe("Validation failed");
    expect(res.body.details).toBeDefined();
  });

  it("returns 400 for a weak password", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ ...validPayload, password: "weak" })
      .expect(400);

    expect(res.body.error).toBe("Validation failed");
  });

 it("ignores a role field if sent (role no longer exists)", async () => {
  const res = await request(app)
    .post("/api/auth/register")
    .send({ ...validPayload, role: "admin" })
    .expect(201);

  // zod strips unknown fields — role is silently ignored
  expect(res.body.user.isAdmin).toBe(false);
  expect(res.body.user.role).toBeUndefined();
});

  it("strips unknown fields from the body", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({
        ...validPayload,
        isVerified: true,
        isActive: false,
      })
      .expect(201);

    // Server-created defaults must win, not attacker-supplied values
    expect(res.body.user.isVerified).toBe(false);
    expect(res.body.user.isActive).toBe(true);
  });
});