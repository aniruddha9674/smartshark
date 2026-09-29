import { describe, it, expect, beforeEach } from "vitest";
import { eq, and } from "drizzle-orm";
import { db } from "../../src/config/db.postgres.js";
import {
  users,
  events,
  businesses,
  pitches,
  follows,
  conversations,
  messages,
} from "../../src/models/postgres/index.js";
import * as eventService from "../../src/services/event.service.js";
import * as followService from "../../src/services/follow.service.js";
import * as messageService from "../../src/services/message.service.js";

const createUser = async (overrides = {}) => {
  const [u] = await db
    .insert(users)
    .values({
      name: "Test",
      email: `t-${Date.now()}-${Math.random()}@example.com`,
      passwordHash: "$2b$12$fake",
      ...overrides,
    })
    .returning();
  return u;
};

const createBusiness = async (ownerId, overrides = {}) => {
  const [b] = await db
    .insert(businesses)
    .values({ ownerId, companyName: "Acme", ...overrides })
    .returning();
  return b;
};

const findEvent = (userId, eventType) =>
  db
    .select()
    .from(events)
    .where(and(eq(events.userId, userId), eq(events.eventType, eventType)));

describe("event integration — follow + message", () => {
  beforeEach(async () => {
    await db.delete(messages);
    await db.delete(conversations);
    await db.delete(follows);
    await db.delete(pitches);
    await db.delete(events);
    await db.delete(users);
  });

  it("logs follow_created when following a business", async () => {
    const follower = await createUser();
    const owner = await createUser();
    const biz = await createBusiness(owner.id);

    await followService.followBusiness(follower.id, biz.id);
    await new Promise((r) => setTimeout(r, 30));

    const rows = await findEvent(follower.id, "follow_created");
    expect(rows.length).toBe(1);
    expect(rows[0].entityType).toBe("business");
    expect(rows[0].entityId).toBe(biz.id);
  });

  it("logs follow_created when following an investor", async () => {
    const follower = await createUser();
    const target = await createUser();
    await db.execute(
      `INSERT INTO investor_profiles (user_id) VALUES ('${target.id}')`
    );

    await followService.followInvestor(follower.id, target.id);
    await new Promise((r) => setTimeout(r, 30));

    const rows = await findEvent(follower.id, "follow_created");
    expect(rows.length).toBe(1);
    expect(rows[0].entityType).toBe("investor");
  });

  it("logs message_sent when sending a message", async () => {
    const a = await createUser();
    const b = await createUser();
    const [conv] = await db
      .insert(conversations)
      .values({ participantAId: a.id, participantBId: b.id })
      .returning();

    await messageService.sendMessage(conv.id, a.id, "Hello");
    await new Promise((r) => setTimeout(r, 30));

    const rows = await findEvent(a.id, "message_sent");
    expect(rows.length).toBe(1);
    expect(rows[0].entityId).toBe(conv.id);
  });
});