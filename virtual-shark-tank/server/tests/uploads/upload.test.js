import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../src/app.js";
import { db } from "../../src/config/db.postgres.js";
import { users } from "../../src/models/postgres/index.js";

const registerUser = async () => {
  const email = `up-${Date.now()}-${Math.random()}@example.com`;
  const res = await request(app)
    .post("/api/auth/register")
    .send({ name: "Uploader", email, password: "Password123", role: "business" })
    .expect(201);
  return { user: res.body.user, token: res.body.accessToken };
};

const tinyPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

describe("POST /api/uploads", () => {
  beforeEach(async () => {
    await db.delete(users);
  });

  it("uploads a PNG", async () => {
    const { token } = await registerUser();
    const res = await request(app)
      .post("/api/uploads")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", tinyPng, "test.png")
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.url).toMatch(/^https:\/\/res\.cloudinary\.com/);
    expect(res.body.data.publicId).toContain("verification-docs/");
  });

  it("400 when no file attached", async () => {
    const { token } = await registerUser();
    await request(app)
      .post("/api/uploads")
      .set("Authorization", `Bearer ${token}`)
      .expect(400);
  });

  it("401 without auth", async () => {
    await request(app)
      .post("/api/uploads")
      .attach("file", tinyPng, "test.png")
      .expect(401);
  });

  it("415 for unsupported file type", async () => {
    const { token } = await registerUser();
    await request(app)
      .post("/api/uploads")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", Buffer.from("hello"), "test.txt")
      .expect(415);
  });

  it("413 when file exceeds 10 MB", async () => {
    const { token } = await registerUser();
    const big = Buffer.alloc(11 * 1024 * 1024, 0);
    await request(app)
      .post("/api/uploads")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", big, "big.png")
      .expect(413);
  });
});