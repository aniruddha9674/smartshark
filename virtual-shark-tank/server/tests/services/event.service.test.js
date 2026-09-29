import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../../src/config/db.postgres.js";
import { users, events } from "../../src/models/postgres/index.js";
import * as eventService from "../../src/services/event.service.js";

const createUser = async () => {
  const [u] = await db
    .insert(users)
    .values({
      name: "Test",
      email: `t-${Date.now()}-${Math.random()}@example.com`,
      passwordHash: "$2b$12$fake",
    })
    .returning();
  return u;
};

describe("event.service", () => {
  beforeEach(async () => {
    await db.delete(events);
    await db.delete(users);
  });

  describe("log", () => {
    it("writes an event with a valid type", async () => {
      const user = await createUser();
      await eventService.log({
        userId: user.id,
        eventType: "pitch_viewed",
        entityType: "pitch",
        entityId: "00000000-0000-4000-8000-000000000000",
        metadata: { source: "direct" },
      });

      const rows = await db.select().from(events);
      expect(rows.length).toBe(1);
      expect(rows[0].eventType).toBe("pitch_viewed");
      expect(rows[0].schemaVersion).toBe(1);
    });

    it("silently swallows unknown event types", async () => {
      const user = await createUser();
      await eventService.log({
        userId: user.id,
        eventType: "unknown_event_xyz",
        metadata: {},
      });

      const rows = await db.select().from(events);
      expect(rows.length).toBe(0);
    });

    it("silently swallows missing required fields", async () => {
      const user = await createUser();
      await eventService.log({
        userId: user.id,
        eventType: "pitch_viewed",
        metadata: { position: 3 }, // missing "surface"
      });

      const rows = await db.select().from(events);
      expect(rows.length).toBe(0);
    });

    it("accepts null userId (anonymous)", async () => {
      await eventService.log({
        userId: null,
        eventType: "search_performed",
        metadata: { query: "saas" },
      });

      const rows = await db.select().from(events);
      expect(rows.length).toBe(1);
      expect(rows[0].userId).toBeNull();
    });

    it("does not throw when the insert fails", async () => {
      // Passing an invalid uuid triggers a DB error, but log() should swallow it
      await expect(
        eventService.log({
          userId: "not-a-uuid",
          eventType: "pitch_viewed",
          metadata: { source: "direct" },
        })
      ).resolves.toBeUndefined();
    });
  });

  describe("logStrict", () => {
    it("throws on unknown event type", async () => {
      const user = await createUser();
      await expect(
        eventService.logStrict({
          userId: user.id,
          eventType: "nonsense",
        })
      ).rejects.toThrow();
    });

    it("writes when valid", async () => {
      const user = await createUser();
      const row = await eventService.logStrict({
        userId: user.id,
        eventType: "onboarding_completed",
      });
      expect(row.id).toBeDefined();
    });
  });

  describe("listMine", () => {
    it("returns only my events, newest first", async () => {
      const me = await createUser();
      const other = await createUser();

      await eventService.log({
        userId: me.id,
        eventType: "pitch_published",
      });
      await new Promise((r) => setTimeout(r, 20));
      await eventService.log({
        userId: me.id,
        eventType: "pitch_closed",
      });
      await eventService.log({
        userId: other.id,
        eventType: "pitch_published",
      });

      const result = await eventService.listMine(me.id);
      expect(result.events.length).toBe(2);
      expect(result.events[0].eventType).toBe("pitch_closed");
    });

    it("filters by eventType", async () => {
      const me = await createUser();
      await eventService.log({ userId: me.id, eventType: "pitch_published" });
      await eventService.log({ userId: me.id, eventType: "pitch_closed" });

      const result = await eventService.listMine(me.id, {
        eventType: "pitch_published",
      });
      expect(result.events.length).toBe(1);
    });
  });

  describe("listForEntity", () => {
    it("returns events about a specific pitch", async () => {
      const user = await createUser();
      const pitchId = "11111111-1111-4111-8111-111111111111";

      await eventService.log({
        userId: user.id,
        eventType: "pitch_viewed",
        entityType: "pitch",
        entityId: pitchId,
       metadata: { source: "direct" },
      });
      await eventService.log({
        userId: user.id,
        eventType: "pitch_viewed",
        entityType: "pitch",
        entityId: "22222222-2222-4222-8222-222222222222",
        metadata: { source: "direct" },
      });

      const result = await eventService.listForEntity("pitch", pitchId);
      expect(result.events.length).toBe(1);
    });
  });

  describe("getRecentlyViewedPitches", () => {
    it("returns unique pitch ids, most recent first", async () => {
      const user = await createUser();
      const p1 = "11111111-1111-4111-8111-111111111111";
      const p2 = "22222222-2222-4222-8222-222222222222";

      await eventService.log({
        userId: user.id,
        eventType: "pitch_viewed",
        entityType: "pitch",
        entityId: p1,
        metadata: { source: "direct" },
      });
      await new Promise((r) => setTimeout(r, 20));
      await eventService.log({
        userId: user.id,
        eventType: "pitch_viewed",
        entityType: "pitch",
        entityId: p2,
        metadata: { source: "direct" },
      });
      await new Promise((r) => setTimeout(r, 20));
      // View p1 again — should still count once, but move to front
      await eventService.log({
        userId: user.id,
        eventType: "pitch_viewed",
        entityType: "pitch",
        entityId: p1,
        metadata: { source: "direct" },
      });

      const ids = await eventService.getRecentlyViewedPitches(user.id);
      expect(ids.length).toBe(2);
      expect(ids[0]).toBe(p1); // most recent view
    });
  });
});