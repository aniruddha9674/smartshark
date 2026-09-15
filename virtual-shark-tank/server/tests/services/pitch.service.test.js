import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../../src/config/db.postgres.js";
import {
  users,
  businessProfiles,
  pitches,
} from "../../src/models/postgres/index.js";
import * as service from "../../src/services/pitch.service.js";
import { ApiError } from "../../src/utils/apiError.js";

// ---- Helpers ----
const createBusinessUser = async (isProfileComplete = false) => {
  const [user] = await db
    .insert(users)
    .values({
      name: "Test Biz",
      email: `biz-${Date.now()}-${Math.random()}@example.com`,
      passwordHash: "$2b$12$fake",
      role: "business",
      isProfileComplete,
    })
    .returning();
  await db.insert(businessProfiles).values({ userId: user.id });
  return user;
};

const validCreatePayload = (overrides = {}) => ({
  title: "Seed Round 2026",
  tagline: "Invest in the future",
  shortPitch: "We help X do Y",
  longSummary: "Long form pitch text...",
  askAmount: 5000000,
  equityOffered: 8,
  stage: "mvp",
  revenueRange: "under_10L",
  ...overrides,
});

describe("pitch.service", () => {
  beforeEach(async () => {
    await db.delete(users);
  });

  // ---------- createPitch ----------
  describe("createPitch", () => {
    it("creates a draft with status=draft", async () => {
      const biz = await createBusinessUser();
      const pitch = await service.createPitch(biz.id, validCreatePayload());
      expect(pitch.status).toBe("draft");
      expect(pitch.businessId).toBe(biz.id);
    });

    it("computes valuation from ask and equity", async () => {
      const biz = await createBusinessUser();
      const pitch = await service.createPitch(biz.id, validCreatePayload());
      // 5000000 / 0.08 = 62,500,000
      expect(pitch.valuation).toBe("62500000.00");
    });

    it("stores numeric fields as strings", async () => {
      const biz = await createBusinessUser();
      const pitch = await service.createPitch(biz.id, validCreatePayload());
      expect(pitch.askAmount).toBe("5000000");
      expect(pitch.equityOffered).toBe("8");
    });

    it("allows multiple drafts", async () => {
      const biz = await createBusinessUser();
      await service.createPitch(biz.id, validCreatePayload());
      await service.createPitch(biz.id, validCreatePayload({ title: "Second" }));
      const mine = await service.getMyPitches(biz.id);
      expect(mine.length).toBe(2);
    });
  });

  // ---------- getPitch ----------
  describe("getPitch", () => {
    it("owner can see their own draft", async () => {
      const biz = await createBusinessUser();
      const created = await service.createPitch(biz.id, validCreatePayload());
      const fetched = await service.getPitch(created.id, biz.id);
      expect(fetched.id).toBe(created.id);
    });

    it("non-owner cannot see a draft", async () => {
      const biz = await createBusinessUser();
      const other = await createBusinessUser();
      const created = await service.createPitch(biz.id, validCreatePayload());
      await expect(service.getPitch(created.id, other.id)).rejects.toThrow(ApiError);
    });

    it("non-owner can see a live pitch", async () => {
      const biz = await createBusinessUser(true);
      const investor = await createBusinessUser();
      const created = await service.createPitch(biz.id, validCreatePayload());
      await service.publishPitch(created.id, biz.id);

      const fetched = await service.getPitch(created.id, investor.id);
      expect(fetched.status).toBe("live");
    });

    it("throws 404 for nonexistent pitch", async () => {
      const fake = "00000000-0000-0000-0000-000000000000";
      await expect(service.getPitch(fake, fake)).rejects.toThrow(ApiError);
    });
  });

  // ---------- updatePitch ----------
  describe("updatePitch", () => {
    it("updates a draft pitch", async () => {
      const biz = await createBusinessUser();
      const pitch = await service.createPitch(biz.id, validCreatePayload());
      const updated = await service.updatePitch(pitch.id, biz.id, {
        tagline: "New tagline",
      });
      expect(updated.tagline).toBe("New tagline");
    });

    it("recomputes valuation when ask changes", async () => {
      const biz = await createBusinessUser();
      const pitch = await service.createPitch(biz.id, validCreatePayload());
      const updated = await service.updatePitch(pitch.id, biz.id, {
        askAmount: 10000000,
      });
      // 10000000 / 0.08 = 125,000,000
      expect(updated.valuation).toBe("125000000.00");
    });

    it("recomputes valuation when equity changes", async () => {
      const biz = await createBusinessUser();
      const pitch = await service.createPitch(biz.id, validCreatePayload());
      const updated = await service.updatePitch(pitch.id, biz.id, {
        equityOffered: 10,
      });
      // 5000000 / 0.10 = 50,000,000
      expect(updated.valuation).toBe("50000000.00");
    });

    it("rejects a non-owner", async () => {
      const biz = await createBusinessUser();
      const other = await createBusinessUser();
      const pitch = await service.createPitch(biz.id, validCreatePayload());
      await expect(
        service.updatePitch(pitch.id, other.id, { tagline: "hijack" })
      ).rejects.toThrow(ApiError);
    });

    it("rejects editing a live pitch", async () => {
      const biz = await createBusinessUser(true);
      const pitch = await service.createPitch(biz.id, validCreatePayload());
      await service.publishPitch(pitch.id, biz.id);
      await expect(
        service.updatePitch(pitch.id, biz.id, { tagline: "New" })
      ).rejects.toThrow(ApiError);
    });

    it("rejects editing a closed pitch", async () => {
      const biz = await createBusinessUser(true);
      const pitch = await service.createPitch(biz.id, validCreatePayload());
      await service.publishPitch(pitch.id, biz.id);
      await service.closePitch(pitch.id, biz.id);
      await expect(
        service.updatePitch(pitch.id, biz.id, { tagline: "New" })
      ).rejects.toThrow(ApiError);
    });
  });

  // ---------- publishPitch ----------
  describe("publishPitch", () => {
    it("publishes a complete draft for a complete-profile business", async () => {
      const biz = await createBusinessUser(true);
      const pitch = await service.createPitch(biz.id, validCreatePayload());
      const published = await service.publishPitch(pitch.id, biz.id);
      expect(published.status).toBe("live");
      expect(published.publishedAt).toBeDefined();
    });

    it("rejects publishing when profile is incomplete", async () => {
      const biz = await createBusinessUser(false);
      const pitch = await service.createPitch(biz.id, validCreatePayload());
      await expect(service.publishPitch(pitch.id, biz.id)).rejects.toThrow(
        ApiError
      );
    });

    it("rejects publishing with missing required fields", async () => {
      const biz = await createBusinessUser(true);
      // Omit tagline, shortPitch, longSummary, stage, revenueRange
      const pitch = await service.createPitch(biz.id, {
        title: "Bare",
        askAmount: 1000000,
        equityOffered: 5,
      });

      try {
        await service.publishPitch(pitch.id, biz.id);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        expect(err.details.missingFields).toContain("tagline");
        expect(err.details.missingFields).toContain("stage");
      }
    });

    it("rejects a non-owner", async () => {
      const biz = await createBusinessUser(true);
      const other = await createBusinessUser(true);
      const pitch = await service.createPitch(biz.id, validCreatePayload());
      await expect(service.publishPitch(pitch.id, other.id)).rejects.toThrow(
        ApiError
      );
    });

    it("rejects publishing an already-live pitch", async () => {
      const biz = await createBusinessUser(true);
      const pitch = await service.createPitch(biz.id, validCreatePayload());
      await service.publishPitch(pitch.id, biz.id);
      await expect(service.publishPitch(pitch.id, biz.id)).rejects.toThrow(
        ApiError
      );
    });

    it("rejects publishing a second live pitch for the same business", async () => {
      const biz = await createBusinessUser(true);
      const first = await service.createPitch(biz.id, validCreatePayload());
      await service.publishPitch(first.id, biz.id);

      const second = await service.createPitch(
        biz.id,
        validCreatePayload({ title: "Second Round" })
      );
      try {
        await service.publishPitch(second.id, biz.id);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        expect(err.statusCode).toBe(409);
        expect(err.message).toMatch(/already have a live pitch/i);
      }
    });

    it("allows publishing after the previous live pitch was closed", async () => {
      const biz = await createBusinessUser(true);
      const first = await service.createPitch(biz.id, validCreatePayload());
      await service.publishPitch(first.id, biz.id);
      await service.closePitch(first.id, biz.id);

      const second = await service.createPitch(
        biz.id,
        validCreatePayload({ title: "Second Round" })
      );
      const published = await service.publishPitch(second.id, biz.id);
      expect(published.status).toBe("live");
    });
  });

  // ---------- closePitch ----------
  describe("closePitch", () => {
    it("closes a live pitch", async () => {
      const biz = await createBusinessUser(true);
      const pitch = await service.createPitch(biz.id, validCreatePayload());
      await service.publishPitch(pitch.id, biz.id);
      const closed = await service.closePitch(pitch.id, biz.id);
      expect(closed.status).toBe("closed");
      expect(closed.closedAt).toBeDefined();
    });

    it("rejects closing a draft", async () => {
      const biz = await createBusinessUser();
      const pitch = await service.createPitch(biz.id, validCreatePayload());
      await expect(service.closePitch(pitch.id, biz.id)).rejects.toThrow(ApiError);
    });

    it("rejects closing a non-owner's pitch", async () => {
      const biz = await createBusinessUser(true);
      const other = await createBusinessUser(true);
      const pitch = await service.createPitch(biz.id, validCreatePayload());
      await service.publishPitch(pitch.id, biz.id);
      await expect(service.closePitch(pitch.id, other.id)).rejects.toThrow(ApiError);
    });
  });

  // ---------- deletePitch ----------
  describe("deletePitch", () => {
    it("deletes a draft", async () => {
      const biz = await createBusinessUser();
      const pitch = await service.createPitch(biz.id, validCreatePayload());
      const result = await service.deletePitch(pitch.id, biz.id);
      expect(result.deleted).toBe(true);
      const after = await service.getMyPitches(biz.id);
      expect(after.length).toBe(0);
    });

    it("rejects deleting a live pitch", async () => {
      const biz = await createBusinessUser(true);
      const pitch = await service.createPitch(biz.id, validCreatePayload());
      await service.publishPitch(pitch.id, biz.id);
      await expect(service.deletePitch(pitch.id, biz.id)).rejects.toThrow(ApiError);
    });

    it("rejects deleting a non-owner's pitch", async () => {
      const biz = await createBusinessUser();
      const other = await createBusinessUser();
      const pitch = await service.createPitch(biz.id, validCreatePayload());
      await expect(service.deletePitch(pitch.id, other.id)).rejects.toThrow(ApiError);
    });
  });

  // ---------- listLivePitches ----------
  describe("listLivePitches", () => {
    it("returns only live pitches", async () => {
      const biz1 = await createBusinessUser(true);
      const biz2 = await createBusinessUser(true);
      await service.createPitch(biz1.id, validCreatePayload()); // draft
      const live = await service.createPitch(biz2.id, validCreatePayload({ title: "Live One" }));
      await service.publishPitch(live.id, biz2.id);

      const result = await service.listLivePitches();
      expect(result.length).toBe(1);
      expect(result[0].status).toBe("live");
    });

    it("filters by stage", async () => {
      const biz = await createBusinessUser(true);
      const p1 = await service.createPitch(biz.id, validCreatePayload({ stage: "mvp" }));
      await service.publishPitch(p1.id, biz.id);

      const mvp = await service.listLivePitches({ stage: "mvp" });
      expect(mvp.length).toBe(1);

      const growth = await service.listLivePitches({ stage: "growth" });
      expect(growth.length).toBe(0);
    });

    it("filters by revenueRange", async () => {
      const biz = await createBusinessUser(true);
      const p1 = await service.createPitch(biz.id, validCreatePayload({ revenueRange: "under_10L" }));
      await service.publishPitch(p1.id, biz.id);

      expect((await service.listLivePitches({ revenueRange: "under_10L" })).length).toBe(1);
      expect((await service.listLivePitches({ revenueRange: "1Cr_10Cr" })).length).toBe(0);
    });

    it("returns empty array when no live pitches", async () => {
      const result = await service.listLivePitches();
      expect(result).toEqual([]);
    });

    it("respects limit", async () => {
      const biz = await createBusinessUser(true);
      for (let i = 0; i < 3; i++) {
        const p = await service.createPitch(biz.id, validCreatePayload({ title: `P${i}` }));
        await service.publishPitch(p.id, biz.id);
        await service.closePitch(p.id, biz.id);
        await db.update(pitches).set({ status: "live" }).where(eq(pitches.id, p.id));
      }
      const limited = await service.listLivePitches({ limit: 2 });
      expect(limited.length).toBe(2);
    });
  });
});