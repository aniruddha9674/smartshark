import { describe, it, expect, vi } from "vitest";
import { withRetry, isTransientError } from "../../src/utils/retry.js";

describe("withRetry", () => {
  it("returns on first success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await withRetry(fn, { attempts: 3 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries then succeeds", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("503"))
      .mockResolvedValueOnce("ok");
    const result = await withRetry(fn, { attempts: 3, baseDelayMs: 10 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("gives up after attempts", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("503"));
    await expect(
      withRetry(fn, { attempts: 3, baseDelayMs: 5 })
    ).rejects.toThrow("503");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("does not retry non-transient errors", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("bad input"));
    await expect(
      withRetry(fn, { attempts: 3, baseDelayMs: 5, shouldRetry: isTransientError })
    ).rejects.toThrow("bad input");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("isTransientError", () => {
  it("matches 429", () => {
    expect(isTransientError(new Error("HTTP 429"))).toBe(true);
  });
  it("matches timeout", () => {
    expect(isTransientError(new Error("request timeout"))).toBe(true);
  });
  it("rejects non-transient", () => {
    expect(isTransientError(new Error("bad json"))).toBe(false);
  });
});