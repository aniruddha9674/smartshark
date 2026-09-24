import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../../src/config/db.postgres.js";
import {
  users,
  businesses,
  pitches,
} from "../../src/models/postgres/index.js";
import * as service from "../../src/services/pitch.service.js";
import { ApiError } from "../../src/utils/apiError.js";

// ---- Helpers ----
const createUser = async (overrides = {}) => {
  const [user] = await db
    .insert(users)
    .values({
      name: `User ${Math.random().toString(36).slice(2, 7)}`,
      email: `u-${Date.now()}-${Math.random()}@example.com`,
      passwordHash: "$2b$12$fake",
      ...overrides,
    })
    .returning();
  return user;
};

const createBusinessFor = async (ownerId, { complete = false, ...overrides } = {}) => {
  const [biz] = await db
    .insert(businesses)
    .values({
      ownerId,
      companyName: "Acme",
      isProfileComplete: complete,
      ...overrides,
    })
    .returning();
  return biz;
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
      const user = await createUser();
      const biz = await createBusinessFor(user.id);
      const pitch = await service.createPitch(biz.id, user.id, validCreatePayload());

      expect(pitch.status).toBe("draft");
      expect(pitch.businessId).toBe(biz.id);
    });

    it("computes valuation from ask and equity", async () => {
      const user = await createUser();
      const biz = await createBusinessFor(user.id);
      const pitch = await service.createPitch(biz.id, user.id, validCreatePayload());
      // 5000000 / 0.08 = 62,500,000
      expect(pitch.valuation).toBe("62500000.00");
    });

    it("stores numeric fields as strings", async () => {
      const user = await createUser();
      const biz = await createBusinessFor(user.id);
      const pitch = await service.createPitch(biz.id, user.id, validCreatePayload());
      expect(pitch.askAmount).toBe("5000000");
      expect(pitch.equityOffered).toBe("8");
    });

    it("rejects a user who does not own the business", async () => {
      const owner = await createUser();
      const attacker = await createUser();
      const biz = await createBusinessFor(owner.id);

      await expect(
        service.createPitch(biz.id, attacker.id, validCreatePayload())
      ).rejects.toThrow(ApiError);
    });

    it("rejects a nonexistent business", async () => {
      const user = await createUser();
      const fake = "00000000-0000-0000-0000-000000000000";
      await expect(
        service.createPitch(fake, user.id, validCreatePayload())
      ).rejects.toThrow(ApiError);
    });
  });

  // ---------- getMyPitches ----------
  describe("getMyPitches", () => {
    it("returns only pitches for the given business", async () => {
      const user = await createUser();
      const biz1 = await createBusinessFor(user.id, { companyName: "A" });
      const biz2 = await createBusinessFor(user.id, { companyName: "B" });

      await service.createPitch(biz1.id, user.id, validCreatePayload());
      await service.createPitch(biz2.id, user.id, validCreatePayload({ title: "Second" }));

      const list = await service.getMyPitches(biz1.id, user.id);
      expect(list.length).toBe(1);
      expect(list[0].businessId).toBe(biz1.id);
    });

    it("rejects a non-owner", async () => {
      const owner = await createUser();
      const attacker = await createUser();
      const biz = await createBusinessFor(owner.id);

      await expect(
        service.getMyPitches(biz.id, attacker.id)
      ).rejects.toThrow(ApiError);
    });
  });

  // ---------- getPitch ----------
  describe("getPitch", () => {
    it("owner can see their own draft", async () => {
      const user = await createUser();
      const biz = await createBusinessFor(user.id);
      const created = await service.createPitch(biz.id, user.id, validCreatePayload());

      const fetched = await service.getPitch(created.id, user.id);
      expect(fetched.id).toBe(created.id);
    });

    it("non-owner cannot see a draft", async () => {
      const owner = await createUser();
      const other = await createUser();
      const biz = await createBusinessFor(owner.id);
      const created = await service.createPitch(biz.id, owner.id, validCreatePayload());

      await expect(service.getPitch(created.id, other.id)).rejects.toThrow(ApiError);
    });

    it("non-owner can see a live pitch", async () => {
      const owner = await createUser();
      const other = await createUser();
      const biz = await createBusinessFor(owner.id, { complete: true });
      const created = await service.createPitch(biz.id, owner.id, validCreatePayload());
      await service.publishPitch(created.id, owner.id);

      const fetched = await service.getPitch(created.id, other.id);
      expect(fetched.status).toBe("live");
    });

    it("throws 404 for nonexistent pitch", async () => {
      const user = await createUser();
      const fake = "00000000-0000-0000-0000-000000000000";
      await expect(service.getPitch(fake, user.id)).rejects.toThrow(ApiError);
    });
  });

  // ---------- updatePitch ----------
  describe("updatePitch", () => {
    it("updates a draft pitch", async () => {
      const user = await createUser();
      const biz = await createBusinessFor(user.id);
      const pitch = await service.createPitch(biz.id, user.id, validCreatePayload());

      const updated = await service.updatePitch(pitch.id, user.id, { tagline: "New tagline" });
      expect(updated.tagline).toBe("New tagline");
    });

    it("recomputes valuation when ask changes", async () => {
      const user = await createUser();
      const biz = await createBusinessFor(user.id);
      const pitch = await service.createPitch(biz.id, user.id, validCreatePayload());

      const updated = await service.updatePitch(pitch.id, user.id, { askAmount: 10000000 });
      // 10000000 / 0.08 = 125,000,000
      expect(updated.valuation).toBe("125000000.00");
    });

    it("recomputes valuation when equity changes", async () => {
      const user = await createUser();
      const biz = await createBusinessFor(user.id);
      const pitch = await service.createPitch(biz.id, user.id, validCreatePayload());

      const updated = await service.updatePitch(pitch.id, user.id, { equityOffered: 10 });
      // 5000000 / 0.10 = 50,000,000
      expect(updated.valuation).toBe("50000000.00");
    });

    it("rejects a non-owner", async () => {
      const owner = await createUser();
      const attacker = await createUser();
      const biz = await createBusinessFor(owner.id);
      const pitch = await service.createPitch(biz.id, owner.id, validCreatePayload());

      await expect(
        service.updatePitch(pitch.id, attacker.id, { tagline: "hijack" })
      ).rejects.toThrow(ApiError);
    });

    it("rejects editing a live pitch", async () => {
      const user = await createUser();
      const biz = await createBusinessFor(user.id, { complete: true });
      const pitch = await service.createPitch(biz.id, user.id, validCreatePayload());
      await service.publishPitch(pitch.id, user.id);

      await expect(
        service.updatePitch(pitch.id, user.id, { tagline: "New" })
      ).rejects.toThrow(ApiError);
    });

    it("rejects editing a closed pitch", async () => {
      const user = await createUser();
      const biz = await createBusinessFor(user.id, { complete: true });
      const pitch = await service.createPitch(biz.id, user.id, validCreatePayload());
      await service.publishPitch(pitch.id, user.id);
      await service.closePitch(pitch.id, user.id);

      await expect(
        service.updatePitch(pitch.id, user.id, { tagline: "New" })
      ).rejects.toThrow(ApiError);
    });
  });

  // ---------- publishPitch ----------
  describe("publishPitch", () => {
    it("publishes a complete draft for a complete-profile business", async () => {
      const user = await createUser();
      const biz = await createBusinessFor(user.id, { complete: true });
      const pitch = await service.createPitch(biz.id, user.id, validCreatePayload());

      const published = await service.publishPitch(pitch.id, user.id);
      expect(published.status).toBe("live");
      expect(published.publishedAt).toBeDefined();
    });

    it("rejects publishing when business profile is incomplete", async () => {
      const user = await createUser();
      const biz = await createBusinessFor(user.id, { complete: false });
      const pitch = await service.createPitch(biz.id, user.id, validCreatePayload());

      await expect(service.publishPitch(pitch.id, user.id)).rejects.toThrow(ApiError);
    });

    it("rejects publishing with missing required fields", async () => {
      const user = await createUser();
      const biz = await createBusinessFor(user.id, { complete: true });
      const pitch = await service.createPitch(biz.id, user.id, {
        title: "Bare",
        askAmount: 1000000,
        equityOffered: 5,
      });

      try {
        await service.publishPitch(pitch.id, user.id);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        expect(err.details.missingFields).toContain("tagline");
        expect(err.details.missingFields).toContain("stage");
      }
    });

    it("rejects a non-owner", async () => {
      const owner = await createUser();
      const attacker = await createUser();
      const biz = await createBusinessFor(owner.id, { complete: true });
      const pitch = await service.createPitch(biz.id, owner.id, validCreatePayload());

      await expect(service.publishPitch(pitch.id, attacker.id)).rejects.toThrow(ApiError);
    });

    it("rejects publishing an already-live pitch", async () => {
      const user = await createUser();
      const biz = await createBusinessFor(user.id, { complete: true });
      const pitch = await service.createPitch(biz.id, user.id, validCreatePayload());
      await service.publishPitch(pitch.id, user.id);

      await expect(service.publishPitch(pitch.id, user.id)).rejects.toThrow(ApiError);
    });

    it("rejects publishing a second live pitch for the same business", async () => {
      const user = await createUser();
      const biz = await createBusinessFor(user.id, { complete: true });

      const first = await service.createPitch(biz.id, user.id, validCreatePayload());
      await service.publishPitch(first.id, user.id);

      const second = await service.createPitch(biz.id, user.id, validCreatePayload({ title: "Second" }));

      try {
        await service.publishPitch(second.id, user.id);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err.statusCode).toBe(409);
        expect(err.message).toMatch(/already has a live pitch/i);
      }
    });

    it("allows publishing after the previous live pitch was closed", async () => {
      const user = await createUser();
      const biz = await createBusinessFor(user.id, { complete: true });

      const first = await service.createPitch(biz.id, user.id, validCreatePayload());
      await service.publishPitch(first.id, user.id);
      await service.closePitch(first.id, user.id);

      const second = await service.createPitch(biz.id, user.id, validCreatePayload({ title: "Second" }));
      const published = await service.publishPitch(second.id, user.id);
      expect(published.status).toBe("live");
    });

    it("allows a user to have live pitches on two different businesses", async () => {
      const user = await createUser();
      const biz1 = await createBusinessFor(user.id, { complete: true, companyName: "A" });
      const biz2 = await createBusinessFor(user.id, { complete: true, companyName: "B" });

      const p1 = await service.createPitch(biz1.id, user.id, validCreatePayload());
      const p2 = await service.createPitch(biz2.id, user.id, validCreatePayload({ title: "Second" }));

      await service.publishPitch(p1.id, user.id);
      await service.publishPitch(p2.id, user.id);
      // No error = pass (one-live-per-business, not per-user)
    });
  });

  // ---------- closePitch ----------
  describe("closePitch", () => {
    it("closes a live pitch", async () => {
      const user = await createUser();
      const biz = await createBusinessFor(user.id, { complete: true });
      const pitch = await service.createPitch(biz.id, user.id, validCreatePayload());
      await service.publishPitch(pitch.id, user.id);

      const closed = await service.closePitch(pitch.id, user.id);
      expect(closed.status).toBe("closed");
      expect(closed.closedAt).toBeDefined();
    });

    it("rejects closing a draft", async () => {
      const user = await createUser();
      const biz = await createBusinessFor(user.id);
      const pitch = await service.createPitch(biz.id, user.id, validCreatePayload());

      await expect(service.closePitch(pitch.id, user.id)).rejects.toThrow(ApiError);
    });

    it("rejects a non-owner", async () => {
      const owner = await createUser();
      const attacker = await createUser();
      const biz = await createBusinessFor(owner.id, { complete: true });
      const pitch = await service.createPitch(biz.id, owner.id, validCreatePayload());
      await service.publishPitch(pitch.id, owner.id);

      await expect(service.closePitch(pitch.id, attacker.id)).rejects.toThrow(ApiError);
    });
  });

  // ---------- deletePitch ----------
  describe("deletePitch", () => {
    it("deletes a draft", async () => {
      const user = await createUser();
      const biz = await createBusinessFor(user.id);
      const pitch = await service.createPitch(biz.id, user.id, validCreatePayload());

      const result = await service.deletePitch(pitch.id, user.id);
      expect(result.deleted).toBe(true);

      const list = await service.getMyPitches(biz.id, user.id);
      expect(list.length).toBe(0);
    });

    it("rejects deleting a live pitch", async () => {
      const user = await createUser();
      const biz = await createBusinessFor(user.id, { complete: true });
      const pitch = await service.createPitch(biz.id, user.id, validCreatePayload());
      await service.publishPitch(pitch.id, user.id);

      await expect(service.deletePitch(pitch.id, user.id)).rejects.toThrow(ApiError);
    });

    it("rejects a non-owner", async () => {
      const owner = await createUser();
      const attacker = await createUser();
      const biz = await createBusinessFor(owner.id);
      const pitch = await service.createPitch(biz.id, owner.id, validCreatePayload());

      await expect(service.deletePitch(pitch.id, attacker.id)).rejects.toThrow(ApiError);
    });
  });

  // ---------- listLivePitches ----------
  describe("listLivePitches", () => {
    it("returns only live pitches", async () => {
      const user = await createUser();
      const biz1 = await createBusinessFor(user.id, { complete: true, companyName: "A" });
      const biz2 = await createBusinessFor(user.id, { complete: true, companyName: "B" });

      await service.createPitch(biz1.id, user.id, validCreatePayload()); // draft
      const live = await service.createPitch(biz2.id, user.id, validCreatePayload({ title: "Live" }));
      await service.publishPitch(live.id, user.id);

      const result = await service.listLivePitches();
      expect(result.length).toBe(1);
      expect(result[0].status).toBe("live");
    });

    it("filters by stage", async () => {
      const user = await createUser();
      const biz = await createBusinessFor(user.id, { complete: true });
      const p = await service.createPitch(biz.id, user.id, validCreatePayload({ stage: "growth" }));
      await service.publishPitch(p.id, user.id);

      expect((await service.listLivePitches({ stage: "growth" })).length).toBe(1);
      expect((await service.listLivePitches({ stage: "mvp" })).length).toBe(0);
    });

    it("filters by revenueRange", async () => {
      const user = await createUser();
      const biz = await createBusinessFor(user.id, { complete: true });
      const p = await service.createPitch(biz.id, user.id, validCreatePayload({ revenueRange: "under_10L" }));
      await service.publishPitch(p.id, user.id);

      expect((await service.listLivePitches({ revenueRange: "under_10L" })).length).toBe(1);
      expect((await service.listLivePitches({ revenueRange: "1Cr_10Cr" })).length).toBe(0);
    });

    it("filters by businessId", async () => {
      const user = await createUser();
      const biz1 = await createBusinessFor(user.id, { complete: true, companyName: "A" });
      const biz2 = await createBusinessFor(user.id, { complete: true, companyName: "B" });

      const p1 = await service.createPitch(biz1.id, user.id, validCreatePayload());
      const p2 = await service.createPitch(biz2.id, user.id, validCreatePayload({ title: "B" }));
      await service.publishPitch(p1.id, user.id);
      await service.publishPitch(p2.id, user.id);

      const result = await service.listLivePitches({ businessId: biz1.id });
      expect(result.length).toBe(1);
      expect(result[0].businessId).toBe(biz1.id);
    });

    it("returns empty array when no live pitches", async () => {
      const result = await service.listLivePitches();
      expect(result).toEqual([]);
    });

    it("respects limit", async () => {
      const user = await createUser();
      // Create 3 live pitches across 3 businesses
      for (let i = 0; i < 3; i++) {
        const biz = await createBusinessFor(user.id, { complete: true, companyName: `Biz ${i}` });
        const p = await service.createPitch(biz.id, user.id, validCreatePayload({ title: `P${i}` }));
        await service.publishPitch(p.id, user.id);
      }

      const limited = await service.listLivePitches({ limit: 2 });
      expect(limited.length).toBe(2);
    });
  });
});