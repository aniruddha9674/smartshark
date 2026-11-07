import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { requireAuth } from "../../src/middleware/auth.middleware.js";
import { ApiError } from "../../src/utils/apiError.js";

const makeReq = (headers = {}) => ({ headers });
const makeRes = () => {
  const res = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
};

// Middleware calls next(err) — doesn't throw. Safety net for any future refactor.
const callAuth = async (req, res, next) => {
  try {
    await requireAuth(req, res, next);
  } catch (e) {
    next(e);
  }
};

const assertUnauthorized = (next) => {
  expect(next).toHaveBeenCalledTimes(1);
  const errArg = next.mock.calls[0][0];
  expect(errArg).toBeTruthy();
  expect(errArg).toBeInstanceOf(ApiError);
  const code = errArg.statusCode ?? errArg.status;
  expect(code).toBe(401);
};

describe("requireAuth — dev bypass", () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    process.env.DEV_BYPASS_AUTH = "true";
    process.env.NODE_ENV = "development";
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("bypasses with x-dev-user-id header in dev", async () => {
    const req = makeReq({ "x-dev-user-id": "00000000-0000-0000-0000-000000000001" });
    const res = makeRes();
    const next = vi.fn();
    await callAuth(req, res, next);
    expect(req.user).toBeDefined();
    expect(req.user.id).toBe("00000000-0000-0000-0000-000000000001");
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeUndefined(); // no error
  });

  it("ignores bypass when NODE_ENV=production", async () => {
    process.env.NODE_ENV = "production";
    const req = makeReq({ "x-dev-user-id": "00000000-0000-0000-0000-000000000001" });
    const res = makeRes();
    const next = vi.fn();
    await callAuth(req, res, next);
    expect(req.user).toBeUndefined();
    assertUnauthorized(next);
  });

  it("ignores bypass when DEV_BYPASS_AUTH unset", async () => {
    delete process.env.DEV_BYPASS_AUTH;
    const req = makeReq({ "x-dev-user-id": "00000000-0000-0000-0000-000000000001" });
    const res = makeRes();
    const next = vi.fn();
    await callAuth(req, res, next);
    assertUnauthorized(next);
  });

  it("ignores bypass when x-dev-user-id header absent", async () => {
    const req = makeReq({});
    const res = makeRes();
    const next = vi.fn();
    await callAuth(req, res, next);
    assertUnauthorized(next);
  });

  it("rejects missing bearer token", async () => {
    process.env.NODE_ENV = "test";
    delete process.env.DEV_BYPASS_AUTH;
    const req = makeReq({});
    const res = makeRes();
    const next = vi.fn();
    await callAuth(req, res, next);
    assertUnauthorized(next);
  });
});