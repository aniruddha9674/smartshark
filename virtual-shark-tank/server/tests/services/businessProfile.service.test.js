import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../../src/config/db.postgres.js";
import {
  users,
  businessProfiles,
  profileEditHistory,
} from "../../src/models/postgres/index.js";
import * as service from "../../src/services/businessProfile.service.js";
import { ApiError } from "../../src/utils/apiError.js";

// ---- Helpers ----
const createBusinessUser = async (overrides = {}) => {
  const [user] = await db
    .insert(users)
    .values({
      name: "Alice Sharma",
      email: `alice-${Date.now()}-${Math.random()}@example.com`,
      passwordHash: "$2b$12$fakehashfakehashfakehash",
      role: "business",
      ...overrides,
    })
    .returning();

  await db.insert(businessProfiles).values({ userId: user.id });
  return user;
};

describe("businessProfile.service", () => {
  beforeEach(async () => {
    await db.delete(users); // cascades
  });

  // ---------- getBusinessProfile ----------
  describe("getBusinessProfile", () => {
    it("returns the profile for a business user", async () => {
      const user = await createBusinessUser();
      const profile = await service.getBusinessProfile(user.id);

      expect(profile.userId).toBe(user.id);
      expect(profile.companyName).toBeNull();
    });

    it("throws 404 if no profile exists", async () => {
      const fakeId = "00000000-0000-0000-0000-000000000000";
      await expect(service.getBusinessProfile(fakeId)).rejects.toThrow(ApiError);
    });
  });

  // ---------- updateBusinessProfile ----------
  describe("updateBusinessProfile", () => {
    it("updates a single field", async () => {
      const user = await createBusinessUser();
      const updated = await service.updateBusinessProfile(user.id, user.id, {
        companyName: "Acme Pvt Ltd",
      });
      expect(updated.companyName).toBe("Acme Pvt Ltd");
    });

    it("updates multiple fields at once", async () => {
      const user = await createBusinessUser();
      const updated = await service.updateBusinessProfile(user.id, user.id, {
        companyName: "Acme Pvt Ltd",
        city: "Bangalore",
        fundingAsk: 5000000,
      });

      expect(updated.companyName).toBe("Acme Pvt Ltd");
      expect(updated.city).toBe("Bangalore");
      expect(updated.fundingAsk).toBe("5000000"); // numeric returns string
    });

    it("writes one audit row per changed field", async () => {
      const user = await createBusinessUser();
      await service.updateBusinessProfile(user.id, user.id, {
        companyName: "Acme",
        city: "Mumbai",
      });

      const history = await db
        .select()
        .from(profileEditHistory)
        .where(eq(profileEditHistory.businessId, user.id));

      expect(history.length).toBe(2);
      expect(history.map((h) => h.fieldName).sort()).toEqual([
        "city",
        "companyName",
      ]);
    });

    it("records oldValue and newValue correctly", async () => {
      const user = await createBusinessUser();
      await service.updateBusinessProfile(user.id, user.id, {
        companyName: "First Name",
      });
      await service.updateBusinessProfile(user.id, user.id, {
        companyName: "Second Name",
      });

      const history = await db
        .select()
        .from(profileEditHistory)
        .where(eq(profileEditHistory.fieldName, "companyName"));

      expect(history.length).toBe(2);
      // Oldest first: (null → "First Name")
      const first = history.find((h) => h.oldValue === null);
      const second = history.find((h) => h.oldValue === "First Name");
      expect(first.newValue).toBe("First Name");
      expect(second.newValue).toBe("Second Name");
    });

    it("does NOT write an audit row when the value is unchanged", async () => {
      const user = await createBusinessUser();
      await service.updateBusinessProfile(user.id, user.id, {
        companyName: "Acme",
      });
      await service.updateBusinessProfile(user.id, user.id, {
        companyName: "Acme", // same value
      });

      const history = await db
        .select()
        .from(profileEditHistory)
        .where(eq(profileEditHistory.businessId, user.id));

      expect(history.length).toBe(1); // only the first change
    });

    it("returns current profile unchanged when no fields differ", async () => {
      const user = await createBusinessUser();
      await service.updateBusinessProfile(user.id, user.id, {
        companyName: "Acme",
      });
      const same = await service.updateBusinessProfile(user.id, user.id, {
        companyName: "Acme",
      });
      expect(same.companyName).toBe("Acme");
    });

    it("stores the editor id in the audit row", async () => {
      const user = await createBusinessUser();
      await service.updateBusinessProfile(user.id, user.id, {
        city: "Delhi",
      });
      const [row] = await db
        .select()
        .from(profileEditHistory)
        .where(eq(profileEditHistory.businessId, user.id));
      expect(row.editedById).toBe(user.id);
    });

    it("throws 404 if profile does not exist", async () => {
      const fakeId = "00000000-0000-0000-0000-000000000000";
      await expect(
        service.updateBusinessProfile(fakeId, fakeId, { city: "X" })
      ).rejects.toThrow(ApiError);
    });
  });

  // ---------- completeBusinessProfile ----------
  describe("completeBusinessProfile", () => {
    it("throws 400 listing missing fields when profile is empty", async () => {
      const user = await createBusinessUser();

      try {
        await service.completeBusinessProfile(user.id);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        expect(err.statusCode).toBe(400);
        expect(err.details.missingFields).toContain("companyName");
        expect(err.details.missingFields).toContain("sector");
        expect(err.details.missingFields.length).toBe(6);
      }
    });

    it("throws 400 listing only the still-missing fields", async () => {
      const user = await createBusinessUser();
      await service.updateBusinessProfile(user.id, user.id, {
        companyName: "Acme",
        sector: "SaaS",
        city: "Bangalore",
        description: "We do SaaS things",
        fundingAsk: 5000000,
      });

      try {
        await service.completeBusinessProfile(user.id);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err.details.missingFields).toEqual(["yearsOperating"]);
      }
    });

    it("sets isProfileComplete to true when all required fields are present", async () => {
      const user = await createBusinessUser();
      await service.updateBusinessProfile(user.id, user.id, {
        companyName: "Acme",
        sector: "SaaS",
        city: "Bangalore",
        description: "We do SaaS things",
        fundingAsk: 5000000,
        yearsOperating: 3,
      });

      const result = await service.completeBusinessProfile(user.id);
      expect(result.isProfileComplete).toBe(true);

      const [updatedUser] = await db
        .select()
        .from(users)
        .where(eq(users.id, user.id));
      expect(updatedUser.isProfileComplete).toBe(true);
    });

    it("is idempotent — calling twice succeeds", async () => {
      const user = await createBusinessUser();
      await service.updateBusinessProfile(user.id, user.id, {
        companyName: "Acme",
        sector: "SaaS",
        city: "Bangalore",
        description: "We do SaaS things",
        fundingAsk: 5000000,
        yearsOperating: 3,
      });

      await service.completeBusinessProfile(user.id);
      await service.completeBusinessProfile(user.id);
      // No error = pass
    });

    it("does not write to profile_edit_history", async () => {
      const user = await createBusinessUser();
      await service.updateBusinessProfile(user.id, user.id, {
        companyName: "Acme",
        sector: "SaaS",
        city: "Bangalore",
        description: "We do SaaS things",
        fundingAsk: 5000000,
        yearsOperating: 3,
      });
      await service.completeBusinessProfile(user.id);

      const history = await db
        .select()
        .from(profileEditHistory)
        .where(eq(profileEditHistory.businessId, user.id));

      // Only the 6 updates from the PATCH, none from complete
      expect(history.length).toBe(6);
    });
  });

  // ---------- getBusinessProfileHistory ----------
  describe("getBusinessProfileHistory", () => {
    it("returns edits newest first", async () => {
      const user = await createBusinessUser();
      await service.updateBusinessProfile(user.id, user.id, {
        companyName: "First",
      });
      await new Promise((r) => setTimeout(r, 50)); // ensure timestamps differ
      await service.updateBusinessProfile(user.id, user.id, {
        companyName: "Second",
      });

      const history = await service.getBusinessProfileHistory(user.id);
      expect(history.length).toBe(2);
      expect(history[0].newValue).toBe("Second"); // newest first
      expect(history[1].newValue).toBe("First");
    });

    it("returns empty array when there are no edits", async () => {
      const user = await createBusinessUser();
      const history = await service.getBusinessProfileHistory(user.id);
      expect(history).toEqual([]);
    });
  });
});