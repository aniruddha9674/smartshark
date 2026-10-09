import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../src/app.js";

describe("GET /api/health", () => {
  it("returns ok when both DBs are up", async () => {
    const res = await request(app).get("/api/health").expect(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.checks.postgres).toBe("ok");
    expect(res.body.checks.mongo).toBe("ok");
  });

  it("includes environment and timestamp", async () => {
    const res = await request(app).get("/api/health").expect(200);
    expect(res.body.environment).toBeDefined();
    expect(res.body.timestamp).toBeDefined();
  });
});