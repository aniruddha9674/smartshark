import { describe, it, expect } from "vitest";
import jwt from "jsonwebtoken";
import {
  signAccessToken,
  verifyAccessToken,
  generateRefreshToken,
  hashRefreshToken,
} from "../../src/utils/tokens.js";
import { env } from "../../src/config/env.js";

describe("tokens utils", () => {
  describe("access token (JWT)", () => {
    it("signs a token with the given payload", () => {
      const token = signAccessToken({ id: "user-123", isAdmin: false });
      expect(typeof token).toBe("string");
      expect(token.split(".").length).toBe(3); // header.payload.signature
    });

    it("verifies a valid token and returns the payload", () => {
      const token = signAccessToken({ id: "user-123", isAdmin: false });
      const payload = verifyAccessToken(token);
      expect(payload.id).toBe("user-123");
      expect(payload.isAdmin).toBe(false);
    });

    it("includes iat and exp claims", () => {
      const token = signAccessToken({ id: "user-123", isAdmin: false });
      const payload = verifyAccessToken(token);
      expect(payload.iat).toBeDefined();
      expect(payload.exp).toBeDefined();
      expect(payload.exp).toBeGreaterThan(payload.iat);
    });

    it("rejects a token signed with a different secret", () => {
      const forged = jwt.sign(
        { id: "attacker", isAdmin: true },
        "not-the-real-secret"
      );
      expect(() => verifyAccessToken(forged)).toThrow();
    });

    it("rejects a malformed token", () => {
      expect(() => verifyAccessToken("not.a.jwt")).toThrow();
    });

    it("rejects a tampered token", () => {
      const token = signAccessToken({ id: "user-123", isAdmin: false });
      const tampered = token.slice(0, -5) + "xxxxx";
      expect(() => verifyAccessToken(tampered)).toThrow();
    });

    it("expires tokens based on configured TTL", () => {
      const token = signAccessToken({ id: "user-123", isAdmin: false });
      const payload = verifyAccessToken(token);
      const ttlSeconds = payload.exp - payload.iat;
      // env.accessTokenTtl is "15m" → 900s
      expect(ttlSeconds).toBe(15 * 60);
    });
  });

  describe("refresh token (opaque random)", () => {
    it("generates a raw token and a hash", () => {
      const { raw, hash } = generateRefreshToken();
      expect(typeof raw).toBe("string");
      expect(typeof hash).toBe("string");
      expect(raw.length).toBe(96); // 48 bytes hex = 96 chars
      expect(hash.length).toBe(64); // sha256 hex = 64 chars
    });

    it("raw and hash are different", () => {
      const { raw, hash } = generateRefreshToken();
      expect(raw).not.toBe(hash);
    });

    it("generates unique tokens every time", () => {
      const a = generateRefreshToken();
      const b = generateRefreshToken();
      expect(a.raw).not.toBe(b.raw);
      expect(a.hash).not.toBe(b.hash);
    });

    it("hashing is deterministic", () => {
      const { raw, hash } = generateRefreshToken();
      const recomputed = hashRefreshToken(raw);
      expect(recomputed).toBe(hash);
    });

    it("hashing a different input produces a different hash", () => {
      const a = generateRefreshToken();
      const b = generateRefreshToken();
      expect(hashRefreshToken(a.raw)).not.toBe(hashRefreshToken(b.raw));
    });
  });
});