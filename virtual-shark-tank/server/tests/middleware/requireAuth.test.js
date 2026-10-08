import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../src/app.js";
import { signAccessToken } from "../../src/utils/tokens.js";
import { db } from "../../src/config/db.postgres.js";
import { users } from "../../src/models/postgres/index.js";

const createUser = async () => {
  const email = `ra-${Date.now()}-${Math.random()}@example.com`;
  const res = await request(app)
    .post("/api/auth/register")
    .send({ name: "Test", email, password: "Password123", role: "business" })
    .expect(201);
  return res.body.user;
};

describe("requireAuth middleware", () => {
  beforeEach(async () => {
    await db.delete(users);
  });

  it("401 without Authorization header", async () => {
    await request(app).get("/api/auth/me").expect(401);
  });

  it("401 with malformed header", async () => {
    await request(app)
      .get("/api/auth/me")
      .set("Authorization", "NotBearer xyz")
      .expect(401);
  });

  it("401 with invalid token", async () => {
    await request(app)
      .get("/api/auth/me")
      .set("Authorization", "Bearer not.a.jwt")
      .expect(401);
  });

  it("200 with valid token", async () => {
    const user = await createUser();
    const token = signAccessToken({ id: user.id, role: user.role });

    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(res.body.user.id).toBe(user.id);
  });
});