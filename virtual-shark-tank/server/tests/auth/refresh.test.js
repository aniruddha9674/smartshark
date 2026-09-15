import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../src/app.js";
import { db } from "../../src/config/db.postgres.js";
import { users, refreshTokens } from "../../src/models/postgres/index.js";

const user = {
  name: "Alice Sharma",
  email: "alice@example.com",
  password: "Password123",
  role: "investor",
};

// ---- Helpers ----

// Register a user and return the refresh cookie string
const registerAndGetCookie = async () => {
  const res = await request(app)
    .post("/api/auth/register")
    .send(user)
    .expect(201);

  const cookie = res.headers["set-cookie"].find((c) =>
    c.startsWith("refreshToken=")
  );
  return { accessToken: res.body.accessToken, cookie };
};

// Extract just the cookie value (without attributes)
const extractCookieValue = (cookie) => cookie.split(";")[0];

describe("POST /api/auth/refresh", () => {
  beforeEach(async () => {
    await db.delete(users); // cascades to refresh_tokens
  });

  it("returns 200 with a new accessToken for a valid refresh cookie", async () => {
    const { cookie } = await registerAndGetCookie();

    const res = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", cookie)
      .expect(200);

    expect(res.body.accessToken).toBeDefined();
    expect(typeof res.body.accessToken).toBe("string");
  });

  it("returns a different accessToken than the original", async () => {
    const { accessToken, cookie } = await registerAndGetCookie();

    await new Promise((r) => setTimeout(r, 1100)); // iat must differ

    const res = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", cookie)
      .expect(200);

    expect(res.body.accessToken).not.toBe(accessToken);
  });

  it("rotates the refresh token — new cookie is different from old", async () => {
    const { cookie } = await registerAndGetCookie();
    const oldValue = extractCookieValue(cookie);

    const res = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", cookie)
      .expect(200);

    const newCookie = res.headers["set-cookie"].find((c) =>
      c.startsWith("refreshToken=")
    );
    const newValue = extractCookieValue(newCookie);

    expect(newValue).not.toBe(oldValue);
  });

  it("revokes the old refresh token in the database after rotation", async () => {
    const { cookie } = await registerAndGetCookie();

    // Before refresh: 1 active token
    const before = await db.select().from(refreshTokens);
    expect(before.length).toBe(1);
    expect(before[0].revoked).toBe(false);

    await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", cookie)
      .expect(200);

    // After refresh: 2 rows, first is revoked, second is active
    const after = await db.select().from(refreshTokens);
    expect(after.length).toBe(2);
    expect(after.filter((t) => t.revoked === false).length).toBe(1);
    expect(after.filter((t) => t.revoked === true).length).toBe(1);
  });

  it("rejects reusing an old (already-rotated) refresh token", async () => {
    const { cookie } = await registerAndGetCookie();

    // First refresh — succeeds, rotates
    await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", cookie)
      .expect(200);

    // Second refresh with the SAME old cookie — must fail
    const res = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", cookie)
      .expect(401);

    expect(res.body.error).toBe("Invalid or expired refresh token");
  });

  it("returns 401 when no cookie is provided", async () => {
    const res = await request(app)
      .post("/api/auth/refresh")
      .expect(401);

    expect(res.body.error).toMatch(/no refresh token/i);
  });

  it("returns 401 when cookie is garbage", async () => {
    await registerAndGetCookie();

    const res = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", "refreshToken=this-is-not-a-real-token")
      .expect(401);

    expect(res.body.error).toBe("Invalid or expired refresh token");
  });

  it("issues a new access token that works on a protected route", async () => {
    const { cookie } = await registerAndGetCookie();

    const refreshRes = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", cookie)
      .expect(200);

    const meRes = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${refreshRes.body.accessToken}`)
      .expect(200);

    expect(meRes.body.user.email).toBe(user.email);
  });
});

describe("POST /api/auth/logout", () => {
  beforeEach(async () => {
    await db.delete(users);
  });

  it("returns 200 and a success message", async () => {
    const { cookie } = await registerAndGetCookie();

    const res = await request(app)
      .post("/api/auth/logout")
      .set("Cookie", cookie)
      .expect(200);

    expect(res.body.message).toBe("Logged out");
  });

  it("clears the refresh cookie", async () => {
    const { cookie } = await registerAndGetCookie();

    const res = await request(app)
      .post("/api/auth/logout")
      .set("Cookie", cookie)
      .expect(200);

    const cleared = res.headers["set-cookie"].find((c) =>
      c.startsWith("refreshToken=")
    );
    expect(cleared).toBeDefined();
    // Cookie is cleared by having an empty value or immediate expiry
    expect(cleared).toMatch(/Expires=Thu, 01 Jan 1970|refreshToken=;/i);
  });

  it("revokes the refresh token in the database", async () => {
    const { cookie } = await registerAndGetCookie();

    await request(app)
      .post("/api/auth/logout")
      .set("Cookie", cookie)
      .expect(200);

    const tokens = await db.select().from(refreshTokens);
    expect(tokens.length).toBe(1);
    expect(tokens[0].revoked).toBe(true);
  });

  it("rejects refresh after logout", async () => {
    const { cookie } = await registerAndGetCookie();

    await request(app)
      .post("/api/auth/logout")
      .set("Cookie", cookie)
      .expect(200);

    const res = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", cookie)
      .expect(401);

    expect(res.body.error).toBe("Invalid or expired refresh token");
  });

  it("is idempotent — logging out twice doesn't crash", async () => {
    const { cookie } = await registerAndGetCookie();

    await request(app)
      .post("/api/auth/logout")
      .set("Cookie", cookie)
      .expect(200);

    await request(app)
      .post("/api/auth/logout")
      .set("Cookie", cookie)
      .expect(200);
  });
});