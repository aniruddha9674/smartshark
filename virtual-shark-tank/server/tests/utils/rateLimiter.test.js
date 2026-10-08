import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  checkRateLimit,
  _resetRateLimiter,
} from "../../src/utils/rateLimiter.js";

describe("checkRateLimit", () => {
  beforeEach(() => _resetRateLimiter());

  it("allows up to limit", () => {
    for (let i = 0; i < 5; i++) {
      expect(() => checkRateLimit("test", 5, 1000)).not.toThrow();
    }
  });

  it("throws on exceeding limit", () => {
    for (let i = 0; i < 5; i++) checkRateLimit("test", 5, 1000);
    expect(() => checkRateLimit("test", 5, 1000)).toThrow(/Rate limit/);
  });

  it("resets after window", async () => {
    for (let i = 0; i < 2; i++) checkRateLimit("test", 2, 50);
    await new Promise((r) => setTimeout(r, 60));
    expect(() => checkRateLimit("test", 2, 50)).not.toThrow();
  });

  it("isolates different keys", () => {
    checkRateLimit("a", 1, 1000);
    expect(() => checkRateLimit("b", 1, 1000)).not.toThrow();
  });
});