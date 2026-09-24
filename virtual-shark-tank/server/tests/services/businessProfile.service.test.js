import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../../src/config/db.postgres.js";
import {
  users,
  businesses,
  profileEditHistory,
} from "../../src/models/postgres/index.js";
import * as service from "../../src/services/businessProfile.service.js";
import { ApiError } from "../../src/utils/apiError.js";

// ---- Helpers ----
const createUser = async () => {
  const [user] = await db
    .insert(users)
    .values({
      name: "Alice Sharma",
      email: `u-${Date.now()}-${Math.random()}@example.com`,
      passwordHash: "$2b$12$fake",
    })
    .returning();
  return user;
};

const createBusinessFor = async (ownerId, overrides = {}) => {
  const [b] = await db
    .insert(businesses)
    .values({ ownerId, ...overrides })
    .returning();
  return b;
};

describe("businessProfile.service", () => {
  beforeEach(async () => {
    await db.delete(users); // cascades to businesses + profile_edit_history
  });

  // ---------- createBusiness ----------
  describe("createBusiness", () => {
    it("creates a business owned by the user", async () => {
      const user = await createUser();
      const business = await service.createBusiness(user.id, {
        companyName: "Acme Pvt Ltd",
      });
      expect(business.ownerId).toBe(user.id);
      expect(business.companyName).toBe("Acme Pvt Ltd");
      expect(business.isProfileComplete).toBe(false);
    });

    it("allows a user to own multiple businesses", async () => {
      const user = await createUser();
      await service.createBusiness(user.id, { companyName: "Acme" });
      await service.createBusiness(user.id, { companyName: "Beta" });

      const list = await service.listMyBusinesses(user.id);
      expect(list.length).toBe(2);
    });
  });

  // ---------- listMyBusinesses ----------
  describe("listMyBusinesses", () => {
    it("returns only businesses owned by the user", async () => {
      const a = await createUser();
      const b = await createUser();
      await createBusinessFor(a.id, { companyName: "A's Biz" });
      await createBusinessFor(b.id, { companyName: "B's Biz" });

      const list = await service.listMyBusinesses(a.id);
      expect(list.length).toBe(1);
      expect(list[0].companyName).toBe("A's Biz");
    });

    it("returns empty when user owns nothing", async () => {
      const user = await createUser();
      const list = await service.listMyBusinesses(user.id);
      expect(list).toEqual([]);
    });
  });

  // ---------- getBusiness ----------
  describe("getBusiness", () => {
    it("returns the business for its owner", async () => {
      const user = await createUser();
      const biz = await createBusinessFor(user.id, { companyName: "Acme" });

      const result = await service.getBusiness(biz.id, user.id);
      expect(result.id).toBe(biz.id);
    });

    it("throws 403 for a non-owner", async () => {
      const owner = await createUser();
      const attacker = await createUser();
      const biz = await createBusinessFor(owner.id);

      await expect(service.getBusiness(biz.id, attacker.id)).rejects.toThrow(ApiError);
    });

    it("throws 404 for a nonexistent business", async () => {
      const user = await createUser();
      const fake = "00000000-0000-0000-0000-000000000000";
      await expect(service.getBusiness(fake, user.id)).rejects.toThrow(ApiError);
    });
  });

  // ---------- updateBusiness ----------
  describe("updateBusiness", () => {
    it("updates a single field", async () => {
      const user = await createUser();
      const biz = await createBusinessFor(user.id);

      const updated = await service.updateBusiness(biz.id, user.id, {
        companyName: "Acme Pvt Ltd",
      });
      expect(updated.companyName).toBe("Acme Pvt Ltd");
    });

    it("updates multiple fields at once", async () => {
      const user = await createUser();
      const biz = await createBusinessFor(user.id);

      const updated = await service.updateBusiness(biz.id, user.id, {
        companyName: "Acme",
        city: "Bangalore",
        fundingAsk: 5000000,
      });
      expect(updated.companyName).toBe("Acme");
      expect(updated.city).toBe("Bangalore");
    });

    it("writes one audit row per changed field", async () => {
      const user = await createUser();
      const biz = await createBusinessFor(user.id);

      await service.updateBusiness(biz.id, user.id, {
        companyName: "Acme",
        city: "Mumbai",
      });

      const history = await db
        .select()
        .from(profileEditHistory)
        .where(eq(profileEditHistory.businessId, biz.id));
      expect(history.length).toBe(2);
    });

    it("does NOT write an audit row when value is unchanged", async () => {
      const user = await createUser();
      const biz = await createBusinessFor(user.id, { companyName: "Acme" });

      await service.updateBusiness(biz.id, user.id, { companyName: "Acme" });

      const history = await db
        .select()
        .from(profileEditHistory)
        .where(eq(profileEditHistory.businessId, biz.id));
      expect(history.length).toBe(0);
    });

    it("records oldValue and newValue correctly", async () => {
      const user = await createUser();
      const biz = await createBusinessFor(user.id, { companyName: "First" });

      await service.updateBusiness(biz.id, user.id, { companyName: "Second" });

      const [row] = await db
        .select()
        .from(profileEditHistory)
        .where(eq(profileEditHistory.businessId, biz.id));
      expect(row.oldValue).toBe("First");
      expect(row.newValue).toBe("Second");
    });

    it("rejects a non-owner", async () => {
      const owner = await createUser();
      const attacker = await createUser();
      const biz = await createBusinessFor(owner.id);

      await expect(
        service.updateBusiness(biz.id, attacker.id, { companyName: "Hijacked" })
      ).rejects.toThrow(ApiError);
    });
  });

  // ---------- completeBusiness ----------
  describe("completeBusiness", () => {
    it("throws 400 listing missing fields when empty", async () => {
      const user = await createUser();
      const biz = await createBusinessFor(user.id);

      try {
        await service.completeBusiness(biz.id, user.id);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err.statusCode).toBe(400);
        expect(err.details.missingFields).toContain("companyName");
      }
    });

    it("sets isProfileComplete when all required fields present", async () => {
      const user = await createUser();
      const biz = await createBusinessFor(user.id, {
        companyName: "Acme",
        sector: "SaaS",
        city: "Bangalore",
        description: "We do SaaS things",
        fundingAsk: 5000000,
        yearsOperating: 3,
      });

      const result = await service.completeBusiness(biz.id, user.id);
      expect(result.isProfileComplete).toBe(true);

      const [updated] = await db
        .select()
        .from(businesses)
        .where(eq(businesses.id, biz.id));
      expect(updated.isProfileComplete).toBe(true);
    });

    it("is idempotent", async () => {
      const user = await createUser();
      const biz = await createBusinessFor(user.id, {
        companyName: "Acme",
        sector: "SaaS",
        city: "Bangalore",
        description: "We do SaaS things",
        fundingAsk: 5000000,
        yearsOperating: 3,
      });

      await service.completeBusiness(biz.id, user.id);
      await service.completeBusiness(biz.id, user.id);
    });

    it("rejects a non-owner", async () => {
      const owner = await createUser();
      const attacker = await createUser();
      const biz = await createBusinessFor(owner.id);

      await expect(
        service.completeBusiness(biz.id, attacker.id)
      ).rejects.toThrow(ApiError);
    });
  });

  // ---------- getBusinessHistory ----------
  describe("getBusinessHistory", () => {
    it("returns edits newest first", async () => {
      const user = await createUser();
      const biz = await createBusinessFor(user.id);

      await service.updateBusiness(biz.id, user.id, { companyName: "First" });
      await new Promise((r) => setTimeout(r, 20));
      await service.updateBusiness(biz.id, user.id, { companyName: "Second" });

      const history = await service.getBusinessHistory(biz.id, user.id);
      expect(history.length).toBe(2);
      expect(history[0].newValue).toBe("Second");
    });

    it("returns empty array when no edits", async () => {
      const user = await createUser();
      const biz = await createBusinessFor(user.id);
      const history = await service.getBusinessHistory(biz.id, user.id);
      expect(history).toEqual([]);
    });

    it("rejects a non-owner", async () => {
      const owner = await createUser();
      const attacker = await createUser();
      const biz = await createBusinessFor(owner.id);

      await expect(
        service.getBusinessHistory(biz.id, attacker.id)
      ).rejects.toThrow(ApiError);
    });
  });
});