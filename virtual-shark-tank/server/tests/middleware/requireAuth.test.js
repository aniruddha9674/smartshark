import { describe, it, expect, vi } from "vitest";
import { requireAuth, requireRole } from "../../src/middleware/auth.middleware.js";
import { signAccessToken } from "../../src/utils/tokens.js";
import { ApiError } from "../../src/utils/apiError.js";

// ---- Test helpers ----
const mockReq = (overrides = {}) => ({
  headers: {},
  user: undefined,
  ...overrides,
});

const mockRes = () => ({});

const mockNext = () => vi.fn();

describe("requireAuth", () => {
  it("calls next(ApiError 401) when no Authorization header", () => {
    const req = mockReq();
    const res = mockRes();
    const next = mockNext();

    requireAuth(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(ApiError);
    expect(err.statusCode).toBe(401);
    expect(err.message).toBe("No token provided");
  });

  it("calls next(ApiError 401) when scheme is not Bearer", () => {
    const req = mockReq({ headers: { authorization: "Basic abc123" } });
    const res = mockRes();
    const next = mockNext();

    requireAuth(req, res, next);

    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(ApiError);
    expect(err.statusCode).toBe(401);
  });

  it("calls next(ApiError 401) when token is invalid", () => {
    const req = mockReq({ headers: { authorization: "Bearer not.a.jwt" } });
    const res = mockRes();
    const next = mockNext();

    requireAuth(req, res, next);

    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(ApiError);
    expect(err.statusCode).toBe(401);
    expect(err.message).toBe("Invalid or expired token");
  });

  it("calls next(ApiError 401) when token is signed with the wrong secret", () => {
    // Simulate an attacker using a different secret
    const forged = require("jsonwebtoken").sign(
      { id: "attacker", role: "admin" },
      "wrong-secret"
    );
    const req = mockReq({ headers: { authorization: `Bearer ${forged}` } });
    const res = mockRes();
    const next = mockNext();

    requireAuth(req, res, next);

    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(401);
  });

  it("sets req.user and calls next() with no error for a valid token", () => {
    const token = signAccessToken({ id: "user-123", role: "investor" });
    const req = mockReq({ headers: { authorization: `Bearer ${token}` } });
    const res = mockRes();
    const next = mockNext();

    requireAuth(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(); // no error
    expect(req.user).toBeDefined();
    expect(req.user.id).toBe("user-123");
    expect(req.user.role).toBe("investor");
  });
});

describe("requireRole", () => {
  it("calls next(ApiError 401) when req.user is missing (middleware order bug)", () => {
    const req = mockReq();       // no user set
    const res = mockRes();
    const next = mockNext();

    requireRole("investor")(req, res, next);

    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(ApiError);
    expect(err.statusCode).toBe(401);
  });

  it("calls next(ApiError 403) when role does not match", () => {
    const req = mockReq({ user: { id: "u1", role: "business" } });
    const res = mockRes();
    const next = mockNext();

    requireRole("investor")(req, res, next);

    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(ApiError);
    expect(err.statusCode).toBe(403);
    expect(err.message).toBe("Insufficient permissions");
  });

  it("calls next() with no error when role matches", () => {
    const req = mockReq({ user: { id: "u1", role: "investor" } });
    const res = mockRes();
    const next = mockNext();

    requireRole("investor")(req, res, next);

    expect(next).toHaveBeenCalledWith();
  });

  it("allows any of the listed roles", () => {
    const req = mockReq({ user: { id: "u1", role: "business" } });
    const res = mockRes();
    const next = mockNext();

    requireRole("business", "investor")(req, res, next);

    expect(next).toHaveBeenCalledWith();
  });

  it("does not mutate req.user", () => {
    const original = { id: "u1", role: "investor" };
    const req = mockReq({ user: { ...original } });
    const res = mockRes();
    const next = mockNext();

    requireRole("investor")(req, res, next);

    expect(req.user).toEqual(original);
  });

  it("rejects admin when only business/investor are allowed", () => {
    const req = mockReq({ user: { id: "u1", role: "admin" } });
    const res = mockRes();
    const next = mockNext();

    requireRole("business", "investor")(req, res, next);

    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(403);
  });
});