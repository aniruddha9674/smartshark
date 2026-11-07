import { describe, it, expect, beforeEach, vi } from "vitest";
import { db } from "../../src/config/db.postgres.js";
import { businesses, profileDrafts } from "../../src/models/postgres/index.js";
import * as scrapeModule from "../../src/services/websiteScrape.service.js";
import * as draftService from "../../src/services/profileDraft.service.js";

const { draftProfile, ai } = draftService;

const createBusiness = async (overrides = {}) => {
  const [b] = await db
    .insert(businesses)
    .values({
      companyName: "Test Co",
      websiteUrl: "example.com",
      ...overrides,
    })
    .returning();
  return b;
};
const mockGemini = (response) => {
  vi.spyOn(ai.models, "generateContent").mockResolvedValue({
    text: JSON.stringify(response),
  });
};

describe("profileDraft.service", () => {
  beforeEach(async () => {
    await db.delete(profileDrafts);
    await db.delete(businesses);
    vi.restoreAllMocks();
  });

  describe("draftProfile — happy path", () => {
    it("merges deterministic + LLM, deterministic wins on conflict", async () => {
      const business = await createBusiness();
      vi.spyOn(scrapeModule, "scrapeWebsite").mockResolvedValue({
        url: "example.com",
        html: `<script type="application/ld+json">${JSON.stringify({
          "@type": "Organization",
          name: "JL Name",
          description: "A".repeat(120),
        })}</script>`,
        text: "some website text",
        charCount: 17,
      });
      mockGemini({
        tagline: { value: "LLM tagline", confidence: 0.9 },
        description: { value: "LLM description", confidence: 0.9 },
        sector: { value: "SaaS", confidence: 0.85 },
      });

      const result = await draftProfile(business.id);
      expect(result.extractionMethods.companyName).toBe("json_ld");
      expect(result.extractionMethods.description).toBe("json_ld");
      expect(result.drafts.description.value).toHaveLength(120);
      expect(result.extractionMethods.tagline).toBe("llm");
      expect(result.scrapeCode).toBeNull();
      expect(result.llmCode).toBeNull();
    });

    it("returns empty drafts when both scrape and LLM fail", async () => {
      const business = await createBusiness();
      vi.spyOn(scrapeModule, "scrapeWebsite").mockRejectedValue(new Error("HTTP 403"));
      vi.spyOn(ai.models, "generateContent").mockRejectedValue(new Error("503"));

      const result = await draftProfile(business.id);
      expect(result.fieldCount).toBe(0);
      expect(result.scrapeCode).toBe("scrape_blocked");
      expect(result.llmCode).toBe("llm_unavailable");
    });

    it("continues to LLM when scrape 403s", async () => {
      const business = await createBusiness();
      vi.spyOn(scrapeModule, "scrapeWebsite").mockRejectedValue(
        new Error("HTTP 403 from https://www.infosys.com/")
      );
      mockGemini({
        sector: { value: "IT Services", confidence: 0.95 },
      });

      const result = await draftProfile(business.id);
      expect(result.scrapeCode).toBe("scrape_blocked");
      expect(result.llmCode).toBeNull();
      expect(result.drafts.sector.value).toBe("IT Services");
    });

    it("drops LLM fields below 0.5 confidence", async () => {
      const business = await createBusiness();
      vi.spyOn(scrapeModule, "scrapeWebsite").mockRejectedValue(new Error("HTTP 500"));
      mockGemini({
        tagline: { value: "Good", confidence: 0.9 },
        description: { value: "Low conf", confidence: 0.3 },
      });

      const result = await draftProfile(business.id);
      expect(result.drafts.tagline).toBeDefined();
      expect(result.drafts.description).toBeUndefined();
    });

    it("caps array fields at 6 items", async () => {
      const business = await createBusiness();
      vi.spyOn(scrapeModule, "scrapeWebsite").mockRejectedValue(new Error("HTTP 500"));
      mockGemini({
        keyProducts: {
          value: ["a", "b", "c", "d", "e", "f", "g", "h"],
          confidence: 0.9,
        },
      });

      const result = await draftProfile(business.id);
      expect(result.drafts.keyProducts.value).toHaveLength(6);
    });

    it("continues when extraction throws on bad HTML", async () => {
      const business = await createBusiness();
      // scraped.html is an object instead of string — this is the exact bug
      // from earlier: if a caller passes the wrong shape, extraction throws.
      // The service must catch, log, and continue to LLM.
      vi.spyOn(scrapeModule, "scrapeWebsite").mockResolvedValue({
        url: "example.com",
        html: {}, // ← not a string — extraction will throw
        text: "text",
        charCount: 4,
      });
      mockGemini({ sector: { value: "Retail", confidence: 0.9 } });

      const result = await draftProfile(business.id);
      expect(result.drafts.sector.value).toBe("Retail");
      expect(result.fieldCount).toBeGreaterThan(0);
    });
  });
});