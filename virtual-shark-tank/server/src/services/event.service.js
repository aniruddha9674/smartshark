import { eq, and, desc, sql, sql as sqlFn } from "drizzle-orm";
import { db } from "../config/db.postgres.js";
import { events, rejectedEvents } from "../models/postgres/index.js";
import {
  ALLOWED_EVENTS,
  validateEventType,
  validateMetadata,
} from "../events/registry.js";

/**
 * Increment the rejection counter for an unregistered event type.
 * Best-effort — never throws.
 */
const recordRejection = async (attemptedType, userId) => {
  try {
    const now = new Date();
    await db
      .insert(rejectedEvents)
      .values({
        attemptedType,
        count: 1,
        sampleUserId: userId ?? null,
        firstSeenAt: now,
        lastSeenAt: now,
      })
      .onConflictDoUpdate({
        target: rejectedEvents.attemptedType,
        set: {
          count: sql`${rejectedEvents.count} + 1`,
          lastSeenAt: now,
        },
      });
  } catch (err) {
    console.error("[event.service] failed to record rejection:", err.message);
  }
};

export const log = async (event) => {
  try {
    validateEventType(event.eventType);
    validateMetadata(event.eventType, event.metadata);

    const spec = ALLOWED_EVENTS[event.eventType];

    await db.insert(events).values({
      userId: event.userId ?? null,
      eventType: event.eventType,
      entityType: event.entityType ?? null,
      entityId: event.entityId ?? null,
      metadata: event.metadata ?? null,
      schemaVersion: spec.version,
    });
  } catch (err) {
    // Unknown event type → record it for weekly review
    if (err.message?.startsWith("Unknown event type")) {
      await recordRejection(event.eventType, event.userId);
    }
    console.error(`[event.service.log] ${event.eventType}:`, err.message);
  }
};

export const logStrict = async (event) => {
  validateEventType(event.eventType);
  validateMetadata(event.eventType, event.metadata);

  const spec = ALLOWED_EVENTS[event.eventType];

  const [row] = await db
    .insert(events)
    .values({
      userId: event.userId ?? null,
      eventType: event.eventType,
      entityType: event.entityType ?? null,
      entityId: event.entityId ?? null,
      metadata: event.metadata ?? null,
      schemaVersion: spec.version,
    })
    .returning();

  return row;
};

// The read functions stay exactly as they were in Session 2.
export const listMine = async (userId, { eventType, limit = 20, offset = 0 } = {}) => {
  const conditions = [eq(events.userId, userId)];
  if (eventType) conditions.push(eq(events.eventType, eventType));

  return {
    events: await db
      .select()
      .from(events)
      .where(and(...conditions))
      .orderBy(desc(events.createdAt))
      .limit(limit)
      .offset(offset),
  };
};

export const listForEntity = async (entityType, entityId, { limit = 50, offset = 0 } = {}) => {
  return {
    events: await db
      .select()
      .from(events)
      .where(and(eq(events.entityType, entityType), eq(events.entityId, entityId)))
      .orderBy(desc(events.createdAt))
      .limit(limit)
      .offset(offset),
  };
};

export const countSince = async (eventType, since) => {
  const [row] = await db
    .select({ count: sql`count(*)`.mapWith(Number) })
    .from(events)
    .where(and(eq(events.eventType, eventType), sql`${events.createdAt} >= ${since}`));
  return row.count;
};

export const getRecentlyViewedPitches = async (userId, limit = 10) => {
  const rows = await db
    .select({
      entityId: events.entityId,
      createdAt: events.createdAt,
    })
    .from(events)
    .where(
      and(
        eq(events.userId, userId),
        eq(events.eventType, "pitch_viewed"),
        eq(events.entityType, "pitch")
      )
    )
    .orderBy(desc(events.createdAt))
    .limit(200); // fetch a chunk, dedupe in JS

  const seen = new Set();
  const ids = [];
  for (const r of rows) {
    if (!r.entityId || seen.has(r.entityId)) continue;
    seen.add(r.entityId);
    ids.push(r.entityId);
    if (ids.length >= limit) break;
  }
  return ids;
};