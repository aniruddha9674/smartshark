import Redis from "ioredis";
import { env } from "./env.js";

let client = null;

console.log("[redis] REDIS_URL present:", !!env.redisUrl);
console.log("[redis] REDIS_URL protocol:", env.redisUrl?.split("://")[0]);

if (process.env.NODE_ENV !== "test" && env.redisUrl) {
  try {
    client = new Redis(env.redisUrl, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
      lazyConnect: true,
      connectTimeout: 10000,
      retryStrategy: (times) => {
        console.log(`[redis] retry attempt ${times}`);
        if (times > 2) return null;
        return 500;
      },
      reconnectOnError: false,
    });

    client.on("connecting", () => console.log("[redis] connecting..."));
    client.on("connect", () => console.log("[redis] socket connected"));
    client.on("ready", () => console.log("[redis] ready"));
    client.on("error", (err) => console.error("[redis] error:", err.message, "| code:", err.code));
    client.on("end", () => console.log("[redis] connection ended"));

    client.connect().catch((err) => {
      console.error("[redis] connect() rejected:", err.message, "| code:", err.code);
    });
  } catch (err) {
    console.error("[redis] init failed:", err.message);
    client = null;
  }
} else if (process.env.NODE_ENV !== "test") {
  console.warn("[redis] REDIS_URL not set — cache disabled");
}

export const redis = client;

export const cacheGet = async (key) => {
  if (!client || client.status !== "ready") return null;
  try {
    const raw = await client.get(key);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.error("[redis] get failed:", err.message);
    return null;
  }
};

export const cacheSet = async (key, value, ttlSeconds = 300) => {
  if (!client || client.status !== "ready") return;
  try {
    await client.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch (err) {
    console.error("[redis] set failed:", err.message);
  }
};

export const cacheDel = async (pattern) => {
  if (!client || client.status !== "ready") return;
  try {
    let cursor = "0";
    const keys = [];
    do {
      const [nextCursor, batch] = await client.scan(cursor, "MATCH", pattern, "COUNT", 100);
      cursor = nextCursor;
      keys.push(...batch);
    } while (cursor !== "0");
    if (keys.length > 0) await client.del(...keys);
  } catch (err) {
    console.error("[redis] del failed:", err.message);
  }
};