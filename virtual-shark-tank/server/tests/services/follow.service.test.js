import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../../src/config/db.postgres.js";
import {
  users,
  businesses,
  investorProfiles,
  follows,
  notifications,
} from "../../src/models/postgres/index.js";
import * as service from "../../src/services/follow.service.js";
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

const createBusinessFor = async (ownerId, overrides = {}) => {
  const [b] = await db
    .insert(businesses)
    .values({
      ownerId,
      companyName: `Biz ${Math.random().toString(36).slice(2, 7)}`,
      ...overrides,
    })
    .returning();
  return b;
};

const createInvestor = async (overrides = {}) => {
  const user = await createUser(overrides);
  await db.insert(investorProfiles).values({ userId: user.id, firmName: "Peak" });
  return user;
};

describe("follow.service", () => {
  beforeEach(async () => {
    await db.delete(users);
  });

  // ============================================================
  // FOLLOW BUSINESS
  // ============================================================
  describe("followBusiness", () => {
    it("creates a follow row with targetType=business", async () => {
      const follower = await createUser();
      const owner = await createUser();
      const biz = await createBusinessFor(owner.id);

      const result = await service.followBusiness(follower.id, biz.id);
      expect(result.following).toBe(true);
      expect(result.alreadyFollowing).toBe(false);

      const rows = await db.select().from(follows);
      expect(rows.length).toBe(1);
      expect(rows[0].targetType).toBe("business");
      expect(rows[0].targetBusinessId).toBe(biz.id);
      expect(rows[0].targetUserId).toBeNull();
    });

    it("is idempotent on duplicate follow", async () => {
      const follower = await createUser();
      const owner = await createUser();
      const biz = await createBusinessFor(owner.id);

      await service.followBusiness(follower.id, biz.id);
      const second = await service.followBusiness(follower.id, biz.id);
      expect(second.alreadyFollowing).toBe(true);

      const rows = await db.select().from(follows);
      expect(rows.length).toBe(1);
    });

    it("rejects following your own business", async () => {
      const owner = await createUser();
      const biz = await createBusinessFor(owner.id);

      await expect(service.followBusiness(owner.id, biz.id)).rejects.toThrow(ApiError);
    });

    it("rejects following a nonexistent business", async () => {
      const follower = await createUser();
      const fake = "00000000-0000-0000-0000-000000000000";

      await expect(service.followBusiness(follower.id, fake)).rejects.toThrow(ApiError);
    });

    it("creates a follow notification for the business owner", async () => {
      const follower = await createUser({ name: "Alice" });
      const owner = await createUser();
      const biz = await createBusinessFor(owner.id, { companyName: "Acme" });

      await service.followBusiness(follower.id, biz.id);

      const notifs = await db.select().from(notifications);
      expect(notifs.length).toBe(1);
      expect(notifs[0].type).toBe("follow");
      expect(notifs[0].userId).toBe(owner.id);
      expect(notifs[0].actorId).toBe(follower.id);
    });

    it("does NOT create a second notification on repeat follow", async () => {
      const follower = await createUser();
      const owner = await createUser();
      const biz = await createBusinessFor(owner.id);

      await service.followBusiness(follower.id, biz.id);
      await service.followBusiness(follower.id, biz.id);

      const notifs = await db.select().from(notifications);
      expect(notifs.length).toBe(1);
    });
  });

  describe("unfollowBusiness", () => {
    it("removes the follow row", async () => {
      const follower = await createUser();
      const owner = await createUser();
      const biz = await createBusinessFor(owner.id);

      await service.followBusiness(follower.id, biz.id);
      const result = await service.unfollowBusiness(follower.id, biz.id);
      expect(result.wasFollowing).toBe(true);

      const rows = await db.select().from(follows);
      expect(rows.length).toBe(0);
    });

    it("is idempotent when not following", async () => {
      const follower = await createUser();
      const owner = await createUser();
      const biz = await createBusinessFor(owner.id);

      const result = await service.unfollowBusiness(follower.id, biz.id);
      expect(result.wasFollowing).toBe(false);
    });
  });

  describe("isFollowingBusiness", () => {
    it("returns true when following", async () => {
      const follower = await createUser();
      const owner = await createUser();
      const biz = await createBusinessFor(owner.id);
      await service.followBusiness(follower.id, biz.id);
      expect(await service.isFollowingBusiness(follower.id, biz.id)).toBe(true);
    });

    it("returns false when not following", async () => {
      const follower = await createUser();
      const owner = await createUser();
      const biz = await createBusinessFor(owner.id);
      expect(await service.isFollowingBusiness(follower.id, biz.id)).toBe(false);
    });
  });

  // ============================================================
  // FOLLOW INVESTOR
  // ============================================================
  describe("followInvestor", () => {
    it("creates a follow row with targetType=investor", async () => {
      const follower = await createUser();
      const target = await createInvestor();

      const result = await service.followInvestor(follower.id, target.id);
      expect(result.following).toBe(true);

      const rows = await db.select().from(follows);
      expect(rows[0].targetType).toBe("investor");
      expect(rows[0].targetUserId).toBe(target.id);
      expect(rows[0].targetBusinessId).toBeNull();
    });

    it("rejects following yourself", async () => {
      const user = await createUser();
      await db.insert(investorProfiles).values({ userId: user.id });
      await expect(service.followInvestor(user.id, user.id)).rejects.toThrow(ApiError);
    });

    it("rejects following a non-investor user", async () => {
      const follower = await createUser();
      const regularUser = await createUser(); // no investor profile
      await expect(
        service.followInvestor(follower.id, regularUser.id)
      ).rejects.toThrow(ApiError);
    });

    it("notifies the target investor", async () => {
      const follower = await createUser({ name: "Bob" });
      const investor = await createInvestor();

      await service.followInvestor(follower.id, investor.id);

      const notifs = await db.select().from(notifications);
      expect(notifs.length).toBe(1);
      expect(notifs[0].userId).toBe(investor.id);
      expect(notifs[0].title).toMatch(/Bob/);
    });
  });

  describe("unfollowInvestor", () => {
    it("removes the follow row", async () => {
      const follower = await createUser();
      const investor = await createInvestor();

      await service.followInvestor(follower.id, investor.id);
      const result = await service.unfollowInvestor(follower.id, investor.id);
      expect(result.wasFollowing).toBe(true);
    });

    it("is idempotent", async () => {
      const follower = await createUser();
      const investor = await createInvestor();
      const result = await service.unfollowInvestor(follower.id, investor.id);
      expect(result.wasFollowing).toBe(false);
    });
  });

  // ============================================================
  // GET FOLLOWING (mixed list)
  // ============================================================
  describe("getFollowing", () => {
    it("returns businesses and investors I follow, newest first", async () => {
      const me = await createUser();
      const owner = await createUser();
      const biz = await createBusinessFor(owner.id, { companyName: "Acme" });
      const investor = await createInvestor({ name: "Peak Ventures" });

      await service.followBusiness(me.id, biz.id);
      await new Promise((r) => setTimeout(r, 20));
      await service.followInvestor(me.id, investor.id);

      const result = await service.getFollowing(me.id);
      expect(result.following.length).toBe(2);
      // Newest first — investor was followed second
      expect(result.following[0].type).toBe("investor");
      expect(result.following[0].name).toBe("Peak Ventures");
      expect(result.following[1].type).toBe("business");
      expect(result.following[1].companyName).toBe("Acme");
    });

    it("includes profile fields per target type", async () => {
      const me = await createUser();
      const owner = await createUser();
      const biz = await createBusinessFor(owner.id, {
        companyName: "Acme",
        sector: "SaaS",
        city: "Bangalore",
      });
      const investor = await createInvestor({ name: "Alice" });
      await db
        .update(investorProfiles)
        .set({ firmName: "Peak", investmentFocus: "SaaS" })
        .where(eq(investorProfiles.userId, investor.id));

      await service.followBusiness(me.id, biz.id);
      await service.followInvestor(me.id, investor.id);

      const result = await service.getFollowing(me.id);
      const bizCard = result.following.find((f) => f.type === "business");
      const invCard = result.following.find((f) => f.type === "investor");

      expect(bizCard.companyName).toBe("Acme");
      expect(bizCard.sector).toBe("SaaS");
      expect(invCard.firmName).toBe("Peak");
      expect(invCard.investmentFocus).toBe("SaaS");
    });

    it("returns empty list when following nobody", async () => {
      const me = await createUser();
      const result = await service.getFollowing(me.id);
      expect(result.following).toEqual([]);
      expect(result.pagination.total).toBe(0);
    });
  });

  // ============================================================
  // BUSINESS FOLLOWERS
  // ============================================================
  describe("getBusinessFollowers", () => {
    it("returns followers for the owner", async () => {
      const owner = await createUser();
      const biz = await createBusinessFor(owner.id);
      const f1 = await createUser({ name: "Follower 1" });
      const f2 = await createUser({ name: "Follower 2" });

      await service.followBusiness(f1.id, biz.id);
      await service.followBusiness(f2.id, biz.id);

      const result = await service.getBusinessFollowers(biz.id, owner.id);
      expect(result.followers.length).toBe(2);
      expect(result.pagination.total).toBe(2);
    });

    it("throws 403 for a non-owner", async () => {
      const owner = await createUser();
      const attacker = await createUser();
      const biz = await createBusinessFor(owner.id);

      await expect(
        service.getBusinessFollowers(biz.id, attacker.id)
      ).rejects.toThrow(ApiError);
    });

    it("throws 404 for a nonexistent business", async () => {
      const user = await createUser();
      const fake = "00000000-0000-0000-0000-000000000000";
      await expect(
        service.getBusinessFollowers(fake, user.id)
      ).rejects.toThrow(ApiError);
    });
  });

  // ============================================================
  // INVESTOR FOLLOWERS
  // ============================================================
  describe("getInvestorFollowers", () => {
    it("returns followers for the investor", async () => {
      const investor = await createInvestor();
      const f1 = await createUser();
      const f2 = await createUser();

      await service.followInvestor(f1.id, investor.id);
      await service.followInvestor(f2.id, investor.id);

      const result = await service.getInvestorFollowers(investor.id);
      expect(result.followers.length).toBe(2);
    });

    it("returns empty when nobody follows", async () => {
      const investor = await createInvestor();
      const result = await service.getInvestorFollowers(investor.id);
      expect(result.followers).toEqual([]);
    });
  });
});