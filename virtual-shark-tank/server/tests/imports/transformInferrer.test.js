import { describe, it, expect } from "vitest";
import { inferTransform } from "../../src/services/transformInferrer.service.js";

describe("transformInferrer.service", () => {
  describe("fundingAsk", () => {
    it("detects lakhs when values are small numbers", () => {
      const result = inferTransform(["50", "75", "100", "45"], "fundingAsk");
      expect(result.transform).toBe("lakhsToINR");
      expect(result.confidence).toBe("high");
    });

    it("detects lakhs when values are large (cr) numbers", () => {
      const result = inferTransform(["2", "5", "10"], "fundingAsk");
      expect(result.transform).toBe("lakhsToINR");
    });

    it("detects currency strings", () => {
      const result = inferTransform(
        ["50 Lakhs", "2 Cr", "₹1 crore"],
        "fundingAsk"
      );
      expect(result.transform).toBe("toINR");
    });

    it("treats ambiguous large numbers as plain INR (no conversion)", () => {
  const result = inferTransform(
    ["5000000", "2000000", "15000000"],
    "fundingAsk"
  );
  expect(result.transform).toBe("toNumber");
  expect(result.transform).not.toBe("usdToInr");
});
  });

  describe("yearsOperating", () => {
    it("detects founding year and picks toOperatingYears", () => {
      const result = inferTransform(["2016", "2019", "2021"], "yearsOperating");
      expect(result.transform).toBe("toOperatingYears");
      expect(result.confidence).toBe("high");
    });

    it("detects plain integers (already years)", () => {
      const result = inferTransform(["5", "10", "3"], "yearsOperating");
      expect(result.transform).toBe("toInteger");
    });
  });

  describe("city and sector", () => {
    it("picks normalizeCity for city target", () => {
      const result = inferTransform(["Delhi", "Mumbai"], "city");
      expect(result.transform).toBe("normalizeCity");
    });

    it("picks normalizeSector for sector target", () => {
      const result = inferTransform(["SaaS", "Fintech"], "sector");
      expect(result.transform).toBe("normalizeSector");
    });
  });

  describe("default", () => {
    it("trims strings by default", () => {
      const result = inferTransform(["hello", "world"], "companyName");
      expect(result.transform).toBe("trim");
    });

    it("trims descriptions", () => {
      const result = inferTransform(["A long story"], "description");
      expect(result.transform).toBe("trim");
    });
  });

  describe("edge cases", () => {
    it("handles empty values array", () => {
      const result = inferTransform([], "fundingAsk");
      expect(result.transform).toBeTruthy();
    });

    it("handles null values", () => {
      const result = inferTransform([null, null, ""], "fundingAsk");
      expect(result.transform).toBeTruthy();
    });

    it("handles mixed values without crashing", () => {
      const result = inferTransform(["50", "Lakhs", null, ""], "fundingAsk");
      expect(result.transform).toBeTruthy();
    });
  });
});