import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../../src/config/db.postgres.js";
import {
  users,
  businessProfiles,
  investorProfiles,
  follows,
  notifications,
} from "../../src/models/postgres/index.js";
import * as service from "../../src/services/follow.service.js";
import { ApiError } from "../../src/utils/apiError.js";

const createUser = async (role = "business", overrides = {}) => {
  const [user] = await db
    .insert(users)
    .values({
      name: `User ${Math.random().toString(36).slice(2, 7)}`,
      email: `u-${Date.now()}-${Math.random()}@example.com`,
      passwordHash: "$2b$12$fake",
      role,
      ...overrides,
    })
    .returning();
  if (role === "business") {
    await db.insert(businessProfiles).values({ userId: user.id, companyName: "Acme" });
  } else {
    await db.insert(investorProfiles).values({ userId: user.id, firmName: "Peak" });
  }
  return user;
};

describe("follow.service", () => {
  beforeEach(async () => {
    await db.delete(users);
  });

  describe("followUser", () => {
    it("creates a follow row", async () => {
      const a = await createUser("investor");
      const b = await createUser("business");
      const result = await service.followUser(a.id, b.id);
      expect(result.following).toBe(true);
      expect(result.alreadyFollowing).toBe(false);

      const rows = await db.select().from(follows);
      expect(rows.length).toBe(1);
    });

    it("is idempotent on duplicate follow", async () => {
      const a = await createUser("investor");
      const b = await createUser("business");
      await service.followUser(a.id, b.id);
      const second = await service.followUser(a.id, b.id);
      expect(second.following).toBe(true);
      expect(second.alreadyFollowing).toBe(true);

      const rows = await db.select().from(follows);
      expect(rows.length).toBe(1);
    });

    it("rejects self-follow", async () => {
      const a = await createUser();
      await expect(service.followUser(a.id, a.id)).rejects.toThrow(ApiError);
    });

    it("rejects following a nonexistent user", async () => {
      const a = await createUser();
      const fake = "00000000-0000-0000-0000-000000000000";
      await expect(service.followUser(a.id, fake)).rejects.toThrow(ApiError);
    });

    it("rejects following an inactive user", async () => {
      const a = await createUser();
      const b = await createUser("business", { isActive: false });
      await expect(service.followUser(a.id, b.id)).rejects.toThrow(ApiError);
    });

    it("creates a follow notification for the target", async () => {
      const a = await createUser("investor");
      const b = await createUser("business");
      await service.followUser(a.id, b.id);

      const rows = await db.select().from(notifications);
      expect(rows.length).toBe(1);
      expect(rows[0].type).toBe("follow");
      expect(rows[0].userId).toBe(b.id);
      expect(rows[0].actorId).toBe(a.id);
      expect(rows[0].title).toMatch(/started following you/);
    });

    it("does NOT create a second notification on repeat follow", async () => {
      const a = await createUser("investor");
      const b = await createUser("business");
      await service.followUser(a.id, b.id);
      await service.followUser(a.id, b.id);

      const rows = await db.select().from(notifications);
      expect(rows.length).toBe(1);
    });

    it("skips notification when target has notifyFollow=false", async () => {
      const a = await createUser("investor");
      const b = await createUser("business", { notifyFollow: false });
      await service.followUser(a.id, b.id);

      const rows = await db.select().from(notifications);
      expect(rows.length).toBe(0);

      // But the follow itself still succeeded
      const fs = await db.select().from(follows);
      expect(fs.length).toBe(1);
    });
  });

  describe("unfollowUser", () => {
    it("removes a follow row", async () => {
      const a = await createUser("investor");
      const b = await createUser("business");
      await service.followUser(a.id, b.id);
      const result = await service.unfollowUser(a.id, b.id);
      expect(result.following).toBe(false);
      expect(result.wasFollowing).toBe(true);

      const rows = await db.select().from(follows);
      expect(rows.length).toBe(0);
    });

    it("is idempotent when not following", async () => {
      const a = await createUser("investor");
      const b = await createUser("business");
      const result = await service.unfollowUser(a.id, b.id);
      expect(result.following).toBe(false);
      expect(result.wasFollowing).toBe(false);
    });

    it("rejects self-unfollow", async () => {
      const a = await createUser();
      await expect(service.unfollowUser(a.id, a.id)).rejects.toThrow(ApiError);
    });
  });

  describe("isFollowing", () => {
    it("returns true when following", async () => {
      const a = await createUser("investor");
      const b = await createUser("business");
      await service.followUser(a.id, b.id);
      expect(await service.isFollowing(a.id, b.id)).toBe(true);
    });

    it("returns false when not following", async () => {
      const a = await createUser();
      const b = await createUser();
      expect(await service.isFollowing(a.id, b.id)).toBe(false);
    });
  });

  describe("getFollowing", () => {
    it("returns only users I follow, newest first", async () => {
      const me = await createUser("investor");
      const a = await createUser("business", { name: "First" });
      const b = await createUser("business", { name: "Second" });
      await service.followUser(me.id, a.id);
      await new Promise((r) => setTimeout(r, 20));
      await service.followUser(me.id, b.id);

      const result = await service.getFollowing(me.id);
      expect(result.users.length).toBe(2);
      expect(result.users[0].name).toBe("Second");
      expect(result.users[1].name).toBe("First");
      expect(result.pagination.total).toBe(2);
    });

    it("includes the correct profile shape per role", async () => {
      const me = await createUser("investor");
      const biz = await createUser("business");
      const inv = await createUser("investor");

      await service.followUser(me.id, biz.id);
      await service.followUser(me.id, inv.id);

      const result = await service.getFollowing(me.id);
      const bizCard = result.users.find((u) => u.role === "business");
      const invCard = result.users.find((u) => u.role === "investor");

      expect(bizCard.profile.companyName).toBe("Acme");
      expect(invCard.profile.firmName).toBe("Peak");
    });

    it("respects limit and offset", async () => {
      const me = await createUser("investor");
      for (let i = 0; i < 5; i++) {
        const u = await createUser("business", { name: `U${i}` });
        await service.followUser(me.id, u.id);
      }
      const page1 = await service.getFollowing(me.id, { limit: 2, offset: 0 });
      const page2 = await service.getFollowing(me.id, { limit: 2, offset: 2 });
      expect(page1.users.length).toBe(2);
      expect(page2.users.length).toBe(2);
      expect(page1.users[0].id).not.toBe(page2.users[0].id);
    });

    it("returns empty list when following nobody", async () => {
      const me = await createUser("investor");
      const result = await service.getFollowing(me.id);
      expect(result.users).toEqual([]);
      expect(result.pagination.total).toBe(0);
    });
  });

  describe("getFollowers", () => {
    it("returns only users who follow me", async () => {
      const me = await createUser("business");
      const a = await createUser("investor", { name: "Follower A" });
      const b = await createUser("investor", { name: "Follower B" });
      await service.followUser(a.id, me.id);
      await service.followUser(b.id, me.id);

      const result = await service.getFollowers(me.id);
      expect(result.users.length).toBe(2);
      expect(result.pagination.total).toBe(2);
    });

    it("does not include users I follow (not mutual unless they follow back)", async () => {
      const me = await createUser("business");
      const other = await createUser("investor");
      await service.followUser(me.id, other.id); // I follow them

      const result = await service.getFollowers(me.id);
      expect(result.users.length).toBe(0);
    });
  });
});