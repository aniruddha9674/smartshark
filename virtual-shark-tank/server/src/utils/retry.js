/**
 * Retry an async function with exponential backoff.
 * @param {Function} fn - async function to retry
 * @param {Object} opts
 * @param {number} opts.attempts - total attempts (default 3)
 * @param {number} opts.baseDelayMs - first backoff (default 500)
 * @param {number} opts.maxDelayMs - cap (default 4000)
 * @param {Function} opts.shouldRetry - (err) => boolean
 */
export const withRetry = async (
  fn,
  {
    attempts = 3,
    baseDelayMs = 500,
    maxDelayMs = 4000,
    shouldRetry = () => true,
  } = {}
) => {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (i === attempts - 1 || !shouldRetry(err)) break;

      const delay = Math.min(baseDelayMs * 2 ** i, maxDelayMs);
      const jitter = Math.random() * 0.3 * delay;
      await new Promise((r) => setTimeout(r, delay + jitter));
    }
  }
  throw lastError;
};

/**
 * Retry only on transient errors (rate limit, timeout, 5xx).
 */
export const isTransientError = (err) => {
  const msg = err?.message?.toLowerCase() || "";
  return (
    msg.includes("429") ||
    msg.includes("rate limit") ||
    msg.includes("timeout") ||
    msg.includes("econnreset") ||
    msg.includes("503") ||
    msg.includes("502") ||
    msg.includes("504")
  );
};