import { describe, it, expect, vi } from "vitest";
import { requireAuth, requireAdmin } from "../../src/middleware/auth.middleware.js";
import { signAccessToken } from "../../src/utils/tokens.js";
import { ApiError } from "../../src/utils/apiError.js";

const mockReq = (overrides = {}) => ({ headers: {}, user: undefined, ...overrides });
const mockRes = () => ({});
const mockNext = () => vi.fn();

describe("requireAuth", () => {
  it("401 when no Authorization header", () => {
    const req = mockReq();
    const next = mockNext();
    requireAuth(req, mockRes(), next);

    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(ApiError);
    expect(err.statusCode).toBe(401);
    expect(err.message).toBe("No token provided");
  });

  it("401 when scheme is not Bearer", () => {
    const req = mockReq({ headers: { authorization: "Basic abc123" } });
    const next = mockNext();
    requireAuth(req, mockRes(), next);
    expect(next.mock.calls[0][0].statusCode).toBe(401);
  });

  it("401 when token is invalid", () => {
    const req = mockReq({ headers: { authorization: "Bearer not.a.jwt" } });
    const next = mockNext();
    requireAuth(req, mockRes(), next);
    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(401);
    expect(err.message).toBe("Invalid or expired token");
  });

  it("401 when token signed with wrong secret", () => {
    const jwt = require("jsonwebtoken");
    const forged = jwt.sign({ id: "attacker", isAdmin: true }, "wrong-secret");
    const req = mockReq({ headers: { authorization: `Bearer ${forged}` } });
    const next = mockNext();
    requireAuth(req, mockRes(), next);
    expect(next.mock.calls[0][0].statusCode).toBe(401);
  });

  it("sets req.user and calls next() for a valid token", () => {
    const token = signAccessToken({ id: "user-123", isAdmin: false });
    const req = mockReq({ headers: { authorization: `Bearer ${token}` } });
    const next = mockNext();
    requireAuth(req, mockRes(), next);

    expect(next).toHaveBeenCalledWith();
    expect(req.user.id).toBe("user-123");
    expect(req.user.isAdmin).toBe(false);
  });

  it("preserves isAdmin=true from the token", () => {
    const token = signAccessToken({ id: "admin-1", isAdmin: true });
    const req = mockReq({ headers: { authorization: `Bearer ${token}` } });
    const next = mockNext();
    requireAuth(req, mockRes(), next);
    expect(req.user.isAdmin).toBe(true);
  });
});

describe("requireAdmin", () => {
  it("401 when req.user is missing (middleware order bug)", () => {
    const req = mockReq();
    const next = mockNext();
    requireAdmin(req, mockRes(), next);
    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(401);
  });

  it("403 when user is not admin", () => {
    const req = mockReq({ user: { id: "u1", isAdmin: false } });
    const next = mockNext();
    requireAdmin(req, mockRes(), next);
    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(403);
    expect(err.message).toBe("Admin only");
  });

  it("passes when user is admin", () => {
    const req = mockReq({ user: { id: "u1", isAdmin: true } });
    const next = mockNext();
    requireAdmin(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith();
  });
});