import { describe, it, expect } from "vitest";
import {
  matchColumn,
  classifyMatch,
  proposeMapping,
} from "../../src/services/columnMatcher.service.js";

describe("columnMatcher.service", () => {
  describe("matchColumn", () => {
    it("matches exact field names with high score", () => {
      const result = matchColumn("company name");
      expect(result.field).toBe("companyName");
      expect(result.score).toBeGreaterThan(0.85);
    });

    it("matches 'Startup Name' to companyName", () => {
      const result = matchColumn("Startup Name");
      expect(result.field).toBe("companyName");
      expect(result.score).toBeGreaterThan(0.6);
    });

    it("matches 'Industry' to sector", () => {
      const result = matchColumn("Industry");
      expect(result.field).toBe("sector");
      expect(result.score).toBeGreaterThan(0.85);
    });

    it("matches 'Pitchers City' to city", () => {
      const result = matchColumn("Pitchers City");
      expect(result.field).toBe("city");
      expect(result.score).toBeGreaterThan(0.5);
    });

    it("matches 'Original Ask Amount' to fundingAsk", () => {
      const result = matchColumn("Original Ask Amount");
      expect(result.field).toBe("fundingAsk");
      expect(result.score).toBeGreaterThan(0.4);
    });

    it("matches 'Company Website' to websiteUrl", () => {
      const result = matchColumn("Company Website");
      expect(result.field).toBe("websiteUrl");
      expect(result.score).toBeGreaterThan(0.6);
    });

    it("returns low score for unrelated column", () => {
      const result = matchColumn("Season Number");
      expect(result.score).toBeLessThan(0.5);
    });

    it("handles empty string gracefully", () => {
      const result = matchColumn("");
      expect(result.field).toBeNull();
      expect(result.score).toBe(0);
    });
  });

  describe("classifyMatch", () => {
    it("classifies high confidence", () => {
      expect(classifyMatch(0.9)).toBe("high");
      expect(classifyMatch(0.75)).toBe("high");
    });
    it("classifies medium confidence", () => {
      expect(classifyMatch(0.6)).toBe("medium");
      expect(classifyMatch(0.5)).toBe("medium");
    });
    it("classifies low confidence", () => {
      expect(classifyMatch(0.4)).toBe("low");
      expect(classifyMatch(0)).toBe("low");
    });
  });

  describe("proposeMapping", () => {
    it("maps real Shark Tank India headers", () => {
      const headers = [
        "Startup Name",
        "Industry",
        "Pitchers City",
        "Business Description",
        "Original Ask Amount",
        "Started in",
        "Company Website",
        "Season Number",
        "Episode Number",
      ];

      const result = proposeMapping(headers);
      const bySource = Object.fromEntries(
        result.mappings.map((m) => [m.source, m.field])
      );

      expect(bySource["Startup Name"]).toBe("companyName");
      expect(bySource["Industry"]).toBe("sector");
      expect(bySource["Pitchers City"]).toBe("city");
      expect(bySource["Business Description"]).toBe("description");
      expect(bySource["Original Ask Amount"]).toBe("fundingAsk");
      expect(bySource["Started in"]).toBe("yearsOperating");
      expect(bySource["Company Website"]).toBe("websiteUrl");
      expect(bySource["Season Number"]).toBeNull();
      expect(bySource["Episode Number"]).toBeNull();
    });

    it("does not assign the same field twice", () => {
      const headers = ["Startup Name", "Company Name", "Business Name"];
      const result = proposeMapping(headers);

      const assigned = result.mappings
        .map((m) => m.field)
        .filter((f) => f !== null);

      expect(new Set(assigned).size).toBe(assigned.length);
      expect(assigned.length).toBe(1);
    });

    it("flags conflicting assignments for review", () => {
      const headers = ["Startup Name", "Company Name"];
      const result = proposeMapping(headers);

      const flagged = result.mappings.filter((m) => m.needsReview);
      expect(flagged.length).toBeGreaterThan(0);
    });

    it("counts mapped and unmapped correctly", () => {
      const headers = ["Startup Name", "Season Number"];
      const result = proposeMapping(headers);

      expect(result.mapped).toBe(1);
      expect(result.unmapped).toBe(1);
    });

    it("handles empty header list", () => {
      const result = proposeMapping([]);
      expect(result.mapped).toBe(0);
      expect(result.unmapped).toBe(0);
      expect(result.mappings).toEqual([]);
    });
  });
});