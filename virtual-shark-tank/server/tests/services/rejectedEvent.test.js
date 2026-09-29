import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../../src/config/db.postgres.js";
import { users, events, rejectedEvents } from "../../src/models/postgres/index.js";
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

describe("rejected events tracking", () => {
  beforeEach(async () => {
    await db.delete(rejectedEvents);
    await db.delete(events);
    await db.delete(users);
  });

  it("records an unknown event type", async () => {
    const user = await createUser();
    await eventService.log({
      userId: user.id,
      eventType: "totally_made_up",
    });

    const rows = await db.select().from(rejectedEvents);
    expect(rows.length).toBe(1);
    expect(rows[0].attemptedType).toBe("totally_made_up");
    expect(rows[0].count).toBe(1);
  });

  it("increments the count on repeat attempts", async () => {
    const user = await createUser();
    for (let i = 0; i < 5; i++) {
      await eventService.log({ userId: user.id, eventType: "totally_made_up" });
    }

    const [row] = await db.select().from(rejectedEvents);
    expect(row.count).toBe(5);
  });

  it("does not record registered event types", async () => {
    const user = await createUser();
    await eventService.log({
      userId: user.id,
      eventType: "pitch_published",
    });

    const rejected = await db.select().from(rejectedEvents);
    expect(rejected.length).toBe(0);
  });

  it("records multiple distinct unknown types separately", async () => {
    const user = await createUser();
    await eventService.log({ userId: user.id, eventType: "fake_a" });
    await eventService.log({ userId: user.id, eventType: "fake_b" });
    await eventService.log({ userId: user.id, eventType: "fake_a" });

    const rows = await db.select().from(rejectedEvents);
    expect(rows.length).toBe(2);
    const a = rows.find((r) => r.attemptedType === "fake_a");
    const b = rows.find((r) => r.attemptedType === "fake_b");
    expect(a.count).toBe(2);
    expect(b.count).toBe(1);
  });
});