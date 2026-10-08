const buckets = new Map();

/**
 * Sliding-window rate limiter.
 * @param {string} key - bucket key (e.g., "gemini")
 * @param {number} maxRequests - max per window
 * @param {number} windowMs - window duration in ms
 */
export const checkRateLimit = (key, maxRequests, windowMs) => {
  const now = Date.now();
  const bucket = buckets.get(key) || [];
  const recent = bucket.filter((t) => now - t < windowMs);

  if (recent.length >= maxRequests) {
    const oldest = recent[0];
    const retryAfterMs = windowMs - (now - oldest);
    const err = new Error(
      `Rate limit exceeded for ${key}. Retry after ${Math.ceil(retryAfterMs / 1000)}s`
    );
    err.statusCode = 429;
    err.retryAfterMs = retryAfterMs;
    throw err;
  }

  recent.push(now);
  buckets.set(key, recent);
};

export const _resetRateLimiter = () => buckets.clear();