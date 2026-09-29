import { describe, it, expect, beforeEach } from "vitest";
import { db } from "../../src/config/db.postgres.js";
import {
  users,
  pitches,
  businesses,
  feedImpressions,
} from "../../src/models/postgres/index.js";
import * as service from "../../src/services/feedImpression.service.js";

const setup = async () => {
  const [user] = await db
    .insert(users)
    .values({
      name: "Test",
      email: `t-${Date.now()}-${Math.random()}@example.com`,
      passwordHash: "$2b$12$fake",
    })
    .returning();

  const [biz] = await db
    .insert(businesses)
    .values({ ownerId: user.id, companyName: "Acme" })
    .returning();

  const [pitch] = await db
    .insert(pitches)
    .values({
      businessId: biz.id,
      title: "Seed",
      askAmount: "5000000",
      equityOffered: "8",
      valuation: "62500000.00",
      status: "live",
    })
    .returning();

  return { user, biz, pitch };
};

describe("feedImpression.service", () => {
  beforeEach(async () => {
    await db.delete(feedImpressions);
    await db.delete(pitches);
    await db.delete(users);
  });

  describe("logBatch", () => {
    it("inserts multiple impressions", async () => {
      const { user, pitch } = await setup();

      await service.logBatch([
        {
          userId: user.id,
          pitchId: pitch.id,
          surface: "personalized_feed",
          position: 0,
          score: 85.5,
          modelVersion: "rules-v1",
        },
        {
          userId: user.id,
          pitchId: pitch.id,
          surface: "personalized_feed",
          position: 1,
          score: 72.0,
          modelVersion: "rules-v1",
        },
      ]);

      const rows = await db.select().from(feedImpressions);
      expect(rows.length).toBe(2);
      expect(rows[0].modelVersion).toBe("rules-v1");
    });

    it("does not throw on empty input", async () => {
      await expect(service.logBatch([])).resolves.toBeUndefined();
    });

    it("silently swallows insert errors", async () => {
      await expect(
        service.logBatch([
          {
            userId: "not-a-uuid",
            pitchId: "not-a-uuid",
            surface: "feed",
            position: 0,
            modelVersion: "rules-v1",
          },
        ])
      ).resolves.toBeUndefined();
    });
  });

  describe("countForPitch", () => {
    it("counts impressions for a pitch", async () => {
      const { user, pitch } = await setup();

      await service.logBatch([
        { userId: user.id, pitchId: pitch.id, surface: "feed", position: 0, modelVersion: "rules-v1" },
        { userId: user.id, pitchId: pitch.id, surface: "feed", position: 1, modelVersion: "rules-v1" },
      ]);

      const count = await service.countForPitch(pitch.id);
      expect(count).toBe(2);
    });
  });
});