import { describe, it, expect, beforeEach } from "vitest";
import {
  enforceLimit,
  checkLimit,
  _resetAll,
} from "../../src/services/rateLimit.service.js";
import { ApiError } from "../../src/utils/apiError.js";

describe("rateLimit.service", () => {
  beforeEach(() => {
    _resetAll();
  });

  describe("enforceLimit", () => {
    it("allows requests under the limit", () => {
      const r = enforceLimit("user-1", "send_message", 5);
      expect(r.used).toBe(1);
      expect(r.remaining).toBe(4);
    });

    it("increments on every call", () => {
      enforceLimit("user-1", "send_message", 5);
      enforceLimit("user-1", "send_message", 5);
      const r = enforceLimit("user-1", "send_message", 5);
      expect(r.used).toBe(3);
      expect(r.remaining).toBe(2);
    });

    it("throws 429 when limit is exceeded", () => {
      enforceLimit("user-1", "send_message", 2);
      enforceLimit("user-1", "send_message", 2);
      expect(() => enforceLimit("user-1", "send_message", 2)).toThrow(ApiError);
      try {
        enforceLimit("user-1", "send_message", 2);
      } catch (err) {
        expect(err.statusCode).toBe(429);
      }
    });

    it("tracks different users independently", () => {
      enforceLimit("user-1", "send_message", 2);
      enforceLimit("user-1", "send_message", 2);
      // user-2 should still have full allowance
      const r = enforceLimit("user-2", "send_message", 2);
      expect(r.used).toBe(1);
    });

    it("tracks different actions independently", () => {
      enforceLimit("user-1", "send_message", 2);
      enforceLimit("user-1", "send_message", 2);
      // different action — full allowance
      const r = enforceLimit("user-1", "new_conversation", 2);
      expect(r.used).toBe(1);
    });
  });

  describe("checkLimit", () => {
    it("returns zeros when no requests made", () => {
      const r = checkLimit("user-1", "send_message", 5);
      expect(r.used).toBe(0);
      expect(r.remaining).toBe(5);
    });

    it("does NOT increment", () => {
      enforceLimit("user-1", "send_message", 5);
      checkLimit("user-1", "send_message", 5);
      checkLimit("user-1", "send_message", 5);
      const r = checkLimit("user-1", "send_message", 5);
      expect(r.used).toBe(1);
    });

    it("never returns negative remaining", () => {
      enforceLimit("user-1", "send_message", 1);
      const r = checkLimit("user-1", "send_message", 1);
      expect(r.remaining).toBe(0);
    });
  });
});