import { describe, it, expect, beforeEach, vi } from "vitest";
import { db } from "../../src/config/db.postgres.js";
import { businesses, pitches } from "../../src/models/postgres/index.js";
import { eq } from "drizzle-orm";
import * as briefService from "../../src/services/investorBrief.service.js";

const createBusiness = async (overrides = {}) => {
  const [b] = await db.insert(businesses).values({
    companyName: "Test Co",
    ...overrides,
  }).returning();
  return b;
};

const richBusiness = () => ({
  companyName: "Acme Pvt Ltd",
  sector: "SaaS",
  city: "Pune",
  description: "Acme is a B2B SaaS platform that helps mid-market manufacturers manage inventory.",
  tagline: "Inventory management for mid-market manufacturers",
  businessModel: "B2B SaaS",
  revenueRange: "1Cr_10Cr",
  customerCount: 45,
  fundingAsk: "5000000",
  fundingInstrument: "equity",
});

const validBrief = {
  headline: "Acme is a B2B SaaS platform for inventory management",
  what_they_do: "Acme helps mid-market manufacturers track inventory in real time.",
  traction: "45 customers, ₹1-10 Cr revenue.",
  the_ask: "Raising ₹50L in equity.",
  risks: null,
};

const mockGeminiResponse = (data) => ({
  text: JSON.stringify(data),
});

describe("investorBrief.service", () => {
  beforeEach(async () => {
    await db.delete(pitches);
    await db.delete(businesses);
    vi.restoreAllMocks();
  });

  describe("computeMissing", () => {
    it("returns a list of missing fields for a sparse business", () => {
      const missing = briefService.computeMissing({});
      expect(missing).toContain("Detailed description");
      expect(missing).toContain("Funding ask");
      expect(missing).toContain("Verified registration documents");
    });

    it("returns empty list for a fully-filled business", () => {
      const b = {
        description: "A".repeat(150),
        tagline: "x",
        businessModel: "SaaS",
        targetMarket: "B2B",
        fundingAsk: 5000000,
        revenueRange: "1Cr_10Cr",
        customerCount: 10,
        employeeCount: 5,
        websiteUrl: "x.com",
        selfDeclaredRisks: "some",
        verificationTier: "verified",
      };
      expect(briefService.computeMissing(b)).toEqual([]);
    });

    it("marks funding ask as missing when null", () => {
      const missing = briefService.computeMissing({
        description: "A".repeat(150),
        tagline: "x",
        businessModel: "SaaS",
        targetMarket: "B2B",
        fundingAsk: null,
        revenueRange: "1Cr_10Cr",
        customerCount: 10,
        employeeCount: 5,
        websiteUrl: "x.com",
        selfDeclaredRisks: "some",
        verificationTier: "verified",
      });
      expect(missing).toEqual(["Funding ask"]);
    });
  });

  describe("hasMinimumData", () => {
    it("returns false when description missing", () => {
      expect(briefService.hasMinimumData({ sector: "SaaS" })).toBe(false);
    });

    it("returns false when description too short", () => {
      expect(
        briefService.hasMinimumData({ description: "short", sector: "SaaS" })
      ).toBe(false);
    });

    it("returns false when sector missing", () => {
      expect(
        briefService.hasMinimumData({ description: "A".repeat(100) })
      ).toBe(false);
    });

    it("returns true when both description and sector present", () => {
      expect(
        briefService.hasMinimumData({
          description: "A".repeat(100),
          sector: "SaaS",
        })
      ).toBe(true);
    });
  });

  describe("generateBrief", () => {
    it("returns not_found for nonexistent business", async () => {
      const result = await briefService.generateBrief(
        "00000000-0000-0000-0000-000000000000"
      );
      expect(result.error).toBe("not_found");
    });

    it("returns insufficient_data when minimum data missing", async () => {
      const business = await createBusiness({ companyName: "Sparse" });
      const result = await briefService.generateBrief(business.id);
      expect(result.error).toBe("insufficient_data");
    });

    it("calls Gemini with business name in the prompt", async () => {
      const business = await createBusiness(richBusiness());
      const spy = vi
        .spyOn(briefService.ai.models, "generateContent")
        .mockResolvedValue(mockGeminiResponse(validBrief));

      await briefService.generateBrief(business.id);

      expect(spy).toHaveBeenCalledOnce();
      const prompt = spy.mock.calls[0][0].contents;
      expect(prompt).toContain("Acme Pvt Ltd");
      expect(prompt).toContain("SaaS");
    });

    it("includes missing fields in the prompt", async () => {
      const business = await createBusiness({
        ...richBusiness(),
        fundingAsk: null,
      });
      const spy = vi
        .spyOn(briefService.ai.models, "generateContent")
        .mockResolvedValue(mockGeminiResponse(validBrief));

      await briefService.generateBrief(business.id);

      const prompt = spy.mock.calls[0][0].contents;
      expect(prompt).toContain("Funding ask");
    });

    it("persists the brief to businesses.investorBrief", async () => {
      const business = await createBusiness(richBusiness());
      vi.spyOn(briefService.ai.models, "generateContent").mockResolvedValue(
        mockGeminiResponse(validBrief)
      );

      await briefService.generateBrief(business.id);

      const [row] = await db
        .select()
        .from(businesses)
        .where(eq(businesses.id, business.id));

      expect(row.investorBrief).toBeTruthy();
      expect(row.investorBrief.headline).toBe(validBrief.headline);
      expect(row.investorBriefGeneratedAt).toBeTruthy();
    });

    it("returns generation_failed on Gemini error", async () => {
      const business = await createBusiness(richBusiness());
      vi.spyOn(briefService.ai.models, "generateContent").mockRejectedValue(
        new Error("Gemini 503")
      );

      const result = await briefService.generateBrief(business.id);
      expect(result.error).toBe("generation_failed");
      expect(result.detail).toBe("Gemini 503");
    });
  });

  describe("getBrief", () => {
    it("returns not_found for nonexistent business", async () => {
      const result = await briefService.getBrief(
        "00000000-0000-0000-0000-000000000000"
      );
      expect(result.error).toBe("not_found");
    });

    it("returns cached brief if fresh", async () => {
      const business = await createBusiness({
        ...richBusiness(),
        investorBrief: validBrief,
        investorBriefGeneratedAt: new Date(),
      });

      const spy = vi.spyOn(briefService.ai.models, "generateContent");
      const result = await briefService.getBrief(business.id);

      expect(result.brief.headline).toBe(validBrief.headline);
      expect(result.cached).toBe(true);
      expect(spy).not.toHaveBeenCalled();
    });

    it("regenerates when cache is older than 7 days", async () => {
      const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
      const business = await createBusiness({
        ...richBusiness(),
        investorBrief: { headline: "old" },
        investorBriefGeneratedAt: eightDaysAgo,
      });

      vi.spyOn(briefService.ai.models, "generateContent").mockResolvedValue(
        mockGeminiResponse(validBrief)
      );

      const result = await briefService.getBrief(business.id);
      expect(result.brief.headline).toBe(validBrief.headline);
    });

    it("regenerates when forceRegenerate is true", async () => {
      const business = await createBusiness({
        ...richBusiness(),
        investorBrief: { headline: "cached" },
        investorBriefGeneratedAt: new Date(),
      });

      vi.spyOn(briefService.ai.models, "generateContent").mockResolvedValue(
        mockGeminiResponse(validBrief)
      );

      const result = await briefService.getBrief(business.id, {
        forceRegenerate: true,
      });
      expect(result.brief.headline).toBe(validBrief.headline);
    });
  });
});