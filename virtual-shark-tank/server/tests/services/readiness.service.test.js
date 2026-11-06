import { describe, it, expect, beforeEach } from "vitest";
import { db } from "../../src/config/db.postgres.js";
import { businesses, readinessScores } from "../../src/models/postgres/index.js";
import { eq } from "drizzle-orm";
import {
  computeReadiness,
  recomputeReadiness,
  getReadiness,
} from "../../src/services/readiness.service.js";

const createBusiness = async (overrides = {}) => {
  const [b] = await db.insert(businesses).values({
    companyName: "Test Co",
    ...overrides,
  }).returning();
  return b;
};

const fullBusiness = (overrides = {}) => ({
  companyName: "Acme Pvt Ltd",
  sector: "SaaS",
  city: "Pune",
  description: "A".repeat(200),
  tagline: "Some tagline",
  businessModel: "B2B SaaS",
  employeeCount: 50,
  fundingAsk: "5000000",
  fundingInstrument: "equity",
  useOfFunds: [{ category: "Engineering", pct: 60 }],
  revenueRange: "1Cr_10Cr",
  customerCount: 100,
  revenueTrendBracket: "growing_20",
  verificationTier: "verified",
  websiteUrl: "example.com",
  logoUrl: "logo.com",
  ...overrides,
});

describe("readiness.service", () => {
  beforeEach(async () => {
    await db.delete(readinessScores);
    await db.delete(businesses);
  });

  describe("computeReadiness", () => {
    it("returns 0 for an empty object", () => {
      const result = computeReadiness({});
      expect(result.score).toBe(0);
      expect(result.percentage).toBe(0);
    });

    it("awards 5 points for company name only", () => {
      const result = computeReadiness({
        companyName: "Test",
        verificationTier: "unverified",
      });
      expect(result.score).toBe(5);
      expect(result.percentage).toBe(5);
    });

    it("returns 100 for a fully-filled business", () => {
      const result = computeReadiness(fullBusiness());
      expect(result.score).toBe(100);
      expect(result.percentage).toBe(100);
      expect(result.missing).toEqual([]);
    });

    it("gives 0 for description shorter than 100 chars", () => {
      const result = computeReadiness({ description: "short" });
      const feat = result.breakdown.find((b) => b.key === "description");
      expect(feat.passed).toBe(false);
      expect(feat.points).toBe(0);
    });

    it("awards 10 points for description of 100+ chars", () => {
      const result = computeReadiness({ description: "A".repeat(100) });
      const feat = result.breakdown.find((b) => b.key === "description");
      expect(feat.passed).toBe(true);
      expect(feat.points).toBe(10);
    });

    it("gives 10 points for verified tier and 0 for basic-tier feature", () => {
      const result = computeReadiness({ verificationTier: "verified" });
      const v = result.breakdown.find((b) => b.key === "verifiedDocs");
      const basic = result.breakdown.find((b) => b.key === "basicDocs");
      expect(v.points).toBe(10);
      expect(basic.points).toBe(0);
    });

    it("gives 5 points for basic tier", () => {
      const result = computeReadiness({ verificationTier: "basic" });
      const v = result.breakdown.find((b) => b.key === "verifiedDocs");
      const basic = result.breakdown.find((b) => b.key === "basicDocs");
      expect(v.points).toBe(0);
      expect(basic.points).toBe(5);
    });

    it("returns missing features sorted by impact descending", () => {
      const result = computeReadiness({ companyName: "X" });
      expect(result.missing.length).toBeGreaterThan(0);
      for (let i = 1; i < result.missing.length; i++) {
        expect(result.missing[i - 1].impact).toBeGreaterThanOrEqual(
          result.missing[i].impact
        );
      }
    });

    it("returns at most 3 suggestions", () => {
      const result = computeReadiness({});
      expect(result.suggestions.length).toBeLessThanOrEqual(3);
    });

    it("suggestions reference highest-impact missing features", () => {
      const result = computeReadiness({});
      const topMissing = result.missing.slice(0, 3);
      result.suggestions.forEach((s, i) => {
        expect(s.toLowerCase()).toContain(topMissing[i].label.toLowerCase());
      });
    });
  });

  describe("recomputeReadiness", () => {
    it("persists a new readiness_scores row", async () => {
      const business = await createBusiness(fullBusiness());
      await recomputeReadiness(business.id);

      const rows = await db
        .select()
        .from(readinessScores)
        .where(eq(readinessScores.businessId, business.id));

      expect(rows).toHaveLength(1);
      expect(rows[0].score).toBe(100);
      expect(rows[0].modelVersion).toBe("rules-v1");
    });

    it("returns null for a nonexistent business", async () => {
      const result = await recomputeReadiness(
        "00000000-0000-0000-0000-000000000000"
      );
      expect(result).toBeNull();
    });

    it("appends a new row on every recompute", async () => {
      const business = await createBusiness(fullBusiness());
      await recomputeReadiness(business.id);
      await recomputeReadiness(business.id);

      const rows = await db
        .select()
        .from(readinessScores)
        .where(eq(readinessScores.businessId, business.id));

      expect(rows).toHaveLength(2);
    });
  });

  describe("getReadiness", () => {
    it("returns the latest computed score", async () => {
      const business = await createBusiness(fullBusiness());
      await recomputeReadiness(business.id);

      const result = await getReadiness(business.id);
      expect(result.score).toBe(100);
      expect(result.percentage).toBe(100);
    });

    it("computes on the fly if no score exists", async () => {
      const business = await createBusiness({ companyName: "Fresh" });
      const result = await getReadiness(business.id);
      expect(result.score).toBe(5);
    });
  });
});