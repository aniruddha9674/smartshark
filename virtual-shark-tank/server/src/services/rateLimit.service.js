import { ApiError } from "../utils/apiError.js";

// In-memory store: "userId:action:YYYY-MM-DD" → count
const store = new Map();

// Periodic cleanup of yesterday's keys — prevents unbounded growth.
// unref() so it doesn't keep the Node process alive in tests.
const cleanup = setInterval(() => {
  const today = new Date().toISOString().slice(0, 10);
  for (const k of store.keys()) {
    if (!k.endsWith(today)) store.delete(k);
  }
}, 60 * 60 * 1000);
if (cleanup.unref) cleanup.unref();

const keyFor = (userId, action) => {
  const day = new Date().toISOString().slice(0, 10); // UTC day
  return `${userId}:${action}:${day}`;
};

/**
 * Enforce a daily rate limit for a user + action.
 * Throws ApiError.tooManyRequests if exceeded.
 * Increments the counter on success.
 */
export const enforceLimit = (userId, action, limit) => {
  const key = keyFor(userId, action);
  const current = store.get(key) || 0;

  if (current >= limit) {
    throw ApiError.tooManyRequests(
      `Daily limit reached for ${action.replace("_", " ")}`
    );
  }

  store.set(key, current + 1);
  return { used: current + 1, limit, remaining: limit - current - 1 };
};

/**
 * Read-only check — does NOT increment.
 */
export const checkLimit = (userId, action, limit) => {
  const key = keyFor(userId, action);
  const used = store.get(key) || 0;
  return { used, limit, remaining: Math.max(0, limit - used) };
};

/**
 * Test helper only — resets all counters.
 */
export const _resetAll = () => store.clear();