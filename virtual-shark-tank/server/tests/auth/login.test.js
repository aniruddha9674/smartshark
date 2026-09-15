import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../src/app.js";
import { db } from "../../src/config/db.postgres.js";
import { users } from "../../src/models/postgres/index.js";

const user = {
  name: "Alice Sharma",
  email: "alice@example.com",
  password: "Password123",
  role: "investor",
};

// Helper: register a user so login tests have something to work with
const registerUser = async (overrides = {}) => {
  await request(app)
    .post("/api/auth/register")
    .send({ ...user, ...overrides })
    .expect(201);
};

describe("POST /api/auth/login", () => {
  beforeEach(async () => {
    await db.delete(users);
  });

  it("returns 200 with user and accessToken for valid credentials", async () => {
    await registerUser();

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: user.email, password: user.password })
      .expect(200);

    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe(user.email);
    expect(res.body.user.role).toBe("investor");
    expect(res.body.accessToken).toBeDefined();
  });

  it("never returns the passwordHash", async () => {
    await registerUser();

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: user.email, password: user.password })
      .expect(200);

    expect(res.body.user.passwordHash).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain("$2b$");
  });

  it("sets a fresh httpOnly refresh cookie", async () => {
    await registerUser();

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: user.email, password: user.password })
      .expect(200);

    const cookies = res.headers["set-cookie"];
    const refreshCookie = cookies.find((c) => c.startsWith("refreshToken="));
    expect(refreshCookie).toBeDefined();
    expect(refreshCookie).toMatch(/HttpOnly/i);
    expect(refreshCookie).toMatch(/SameSite=Strict/i);
  });

  it("returns 401 for wrong password", async () => {
    await registerUser();

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: user.email, password: "WrongPassword123" })
      .expect(401);

    expect(res.body.error).toBe("Invalid credentials");
  });

  it("returns 401 for nonexistent email", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "ghost@example.com", password: "Password123" })
      .expect(401);

    expect(res.body.error).toBe("Invalid credentials");
  });

  it("returns the same error for wrong email and wrong password (no user enumeration)", async () => {
    await registerUser();

    const wrongEmail = await request(app)
      .post("/api/auth/login")
      .send({ email: "ghost@example.com", password: user.password })
      .expect(401);

    const wrongPassword = await request(app)
      .post("/api/auth/login")
      .send({ email: user.email, password: "WrongPassword123" })
      .expect(401);

    // Same message means an attacker can't tell which part was wrong
    expect(wrongEmail.body.error).toBe(wrongPassword.body.error);
  });

  it("accepts the email case-insensitively", async () => {
    await registerUser();

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "ALICE@EXAMPLE.COM", password: user.password })
      .expect(200);

    expect(res.body.user.email).toBe(user.email);
  });

  it("returns 400 for an invalid email format", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "not-an-email", password: user.password })
      .expect(400);

    expect(res.body.error).toBe("Validation failed");
  });

  it("returns 400 for an empty password", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: user.email, password: "" })
      .expect(400);

    expect(res.body.error).toBe("Validation failed");
  });

  it("issues a different accessToken than register did", async () => {
    const regRes = await request(app)
      .post("/api/auth/register")
      .send(user)
      .expect(201);

    // Wait 1 second so iat differs, otherwise tokens may be identical
    await new Promise((r) => setTimeout(r, 1100));

    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ email: user.email, password: user.password })
      .expect(200);

    expect(loginRes.body.accessToken).not.toBe(regRes.body.accessToken);
  });
});