import { describe, it, expect } from "vitest";
import {
  buildCrosswalk,
  validateCrosswalk,
} from "../../src/services/crosswalkBuilder.service.js";

describe("crosswalkBuilder.service", () => {
  const sampleMappings = [
    { source: "Startup Name", field: "companyName", transform: "trim" },
    { source: "Industry", field: "sector", transform: "normalizeSector" },
    { source: "Pitchers City", field: "city", transform: "normalizeCity" },
    { source: "Original Ask Amount", field: "fundingAsk", transform: "lakhsToINR" },
    { source: "Started in", field: "yearsOperating", transform: "toOperatingYears" },
    { source: "Season Number", field: null, transform: null },
  ];

  describe("buildCrosswalk", () => {
    it("builds a valid crosswalk from mappings", () => {
      const cw = buildCrosswalk("test_source", sampleMappings);

      expect(cw.source).toBe("test_source");
      expect(cw.target).toBe("businesses");
      expect(cw.version).toBe(1);
      expect(cw.dedupeKey).toBe("companyName");
      expect(cw.fieldMappings["Startup Name"]).toEqual({
        field: "companyName",
        transform: "trim",
      });
      expect(cw.fieldMappings["Industry"].transform).toBe("normalizeSector");
    });

    it("skips null mappings", () => {
      const cw = buildCrosswalk("test_source", sampleMappings);
      expect(cw.fieldMappings["Season Number"]).toBeUndefined();
      expect(Object.keys(cw.fieldMappings).length).toBe(5);
    });

    it("sets companyName as required with minLength", () => {
      const cw = buildCrosswalk("test_source", sampleMappings);
      expect(cw.validators.companyName).toEqual({
        required: true,
        minLength: 2,
        maxLength: 255,
      });
    });

    it("sets number validators for fundingAsk", () => {
      const cw = buildCrosswalk("test_source", sampleMappings);
      expect(cw.validators.fundingAsk.type).toBe("number");
      expect(cw.validators.fundingAsk.min).toBe(0);
    });

    it("sets integer validators for yearsOperating", () => {
      const cw = buildCrosswalk("test_source", sampleMappings);
      expect(cw.validators.yearsOperating.type).toBe("integer");
    });

    it("sets default isExternal to true", () => {
      const cw = buildCrosswalk("test_source", sampleMappings);
      expect(cw.defaults.isExternal).toBe(true);
      expect(cw.defaults.verificationTier).toBe("unverified");
      expect(cw.defaults.isProfileComplete).toBe(false);
    });

    it("uses provided description", () => {
      const cw = buildCrosswalk("test_source", sampleMappings, {
        description: "Custom description",
      });
      expect(cw.description).toBe("Custom description");
    });
  });

  describe("validateCrosswalk", () => {
    it("accepts a valid crosswalk", () => {
      const cw = buildCrosswalk("test_source", sampleMappings);
      const result = validateCrosswalk(cw);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it("rejects missing source", () => {
      const cw = buildCrosswalk("test_source", sampleMappings);
      delete cw.source;
      const result = validateCrosswalk(cw);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Missing source");
    });

    it("rejects empty fieldMappings", () => {
      const cw = buildCrosswalk("test_source", []);
      const result = validateCrosswalk(cw);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("No field mappings");
    });

    it("rejects missing companyName", () => {
      const cw = buildCrosswalk("test_source", [
        { source: "Industry", field: "sector", transform: "normalizeSector" },
      ]);
      const result = validateCrosswalk(cw);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toMatch(/companyName/);
    });
  });
});