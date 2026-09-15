import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../../src/config/db.postgres.js";
import { users, investorProfiles } from "../../src/models/postgres/index.js";
import * as service from "../../src/services/investorProfile.service.js";
import { ApiError } from "../../src/utils/apiError.js";

const createInvestorUser = async (overrides = {}) => {
  const [user] = await db
    .insert(users)
    .values({
      name: "Bob Investor",
      email: `inv-${Date.now()}-${Math.random()}@example.com`,
      passwordHash: "$2b$12$fake",
      role: "investor",
      ...overrides,
    })
    .returning();
  await db.insert(investorProfiles).values({ userId: user.id });
  return user;
};

describe("investorProfile.service", () => {
  beforeEach(async () => {
    await db.delete(users);
  });

  describe("getInvestorProfile", () => {
    it("returns the profile", async () => {
      const user = await createInvestorUser();
      const profile = await service.getInvestorProfile(user.id);
      expect(profile.userId).toBe(user.id);
    });

    it("throws 404 when missing", async () => {
      const fake = "00000000-0000-0000-0000-000000000000";
      await expect(service.getInvestorProfile(fake)).rejects.toThrow(ApiError);
    });
  });

  describe("updateInvestorProfile", () => {
    it("updates a single field", async () => {
      const user = await createInvestorUser();
      const updated = await service.updateInvestorProfile(user.id, {
        firmName: "Peak Ventures",
      });
      expect(updated.firmName).toBe("Peak Ventures");
    });

    it("updates multiple fields", async () => {
      const user = await createInvestorUser();
      const updated = await service.updateInvestorProfile(user.id, {
        firmName: "Peak Ventures",
        minTicketSize: 500000,
        maxTicketSize: 5000000,
      });
      expect(updated.firmName).toBe("Peak Ventures");
      expect(updated.minTicketSize).toBe("500000");
    });

    it("rejects min > max", async () => {
      const user = await createInvestorUser();
      await expect(
        service.updateInvestorProfile(user.id, {
          minTicketSize: 5000000,
          maxTicketSize: 500000,
        })
      ).rejects.toThrow(ApiError);
    });

    it("rejects a new min that exceeds existing max", async () => {
      const user = await createInvestorUser();
      await service.updateInvestorProfile(user.id, {
        minTicketSize: 100000,
        maxTicketSize: 1000000,
      });
      await expect(
        service.updateInvestorProfile(user.id, { minTicketSize: 5000000 })
      ).rejects.toThrow(ApiError);
    });

    it("rejects a new max below existing min", async () => {
      const user = await createInvestorUser();
      await service.updateInvestorProfile(user.id, {
        minTicketSize: 1000000,
        maxTicketSize: 5000000,
      });
      await expect(
        service.updateInvestorProfile(user.id, { maxTicketSize: 500000 })
      ).rejects.toThrow(ApiError);
    });

    it("throws 404 if profile does not exist", async () => {
      const fake = "00000000-0000-0000-0000-000000000000";
      await expect(
        service.updateInvestorProfile(fake, { firmName: "X" })
      ).rejects.toThrow(ApiError);
    });
  });

  describe("completeInvestorProfile", () => {
    it("throws 400 with all missing fields when empty", async () => {
      const user = await createInvestorUser();
      try {
        await service.completeInvestorProfile(user.id);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err.statusCode).toBe(400);
        expect(err.details.missingFields.length).toBe(5);
      }
    });

    it("throws 400 listing only the missing fields", async () => {
      const user = await createInvestorUser();
      await service.updateInvestorProfile(user.id, {
        firmName: "Peak",
        investmentFocus: "SaaS",
        preferredGeography: "India",
        minTicketSize: 500000,
      });
      try {
        await service.completeInvestorProfile(user.id);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err.details.missingFields).toEqual(["maxTicketSize"]);
      }
    });

    it("sets isProfileComplete when all required fields present", async () => {
      const user = await createInvestorUser();
      await service.updateInvestorProfile(user.id, {
        firmName: "Peak",
        investmentFocus: "SaaS",
        preferredGeography: "India",
        minTicketSize: 500000,
        maxTicketSize: 5000000,
      });
      const result = await service.completeInvestorProfile(user.id);
      expect(result.isProfileComplete).toBe(true);

      const [u] = await db.select().from(users).where(eq(users.id, user.id));
      expect(u.isProfileComplete).toBe(true);
    });

    it("is idempotent", async () => {
      const user = await createInvestorUser();
      await service.updateInvestorProfile(user.id, {
        firmName: "Peak",
        investmentFocus: "SaaS",
        preferredGeography: "India",
        minTicketSize: 500000,
        maxTicketSize: 5000000,
      });
      await service.completeInvestorProfile(user.id);
      await service.completeInvestorProfile(user.id);
    });
  });
});