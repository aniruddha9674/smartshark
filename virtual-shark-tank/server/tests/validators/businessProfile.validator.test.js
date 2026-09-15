import { describe, it, expect } from "vitest";
import {
  updateBusinessProfileSchema,
  REQUIRED_PROFILE_FIELDS,
} from "../../src/validators/businessProfile.validator.js";

describe("updateBusinessProfileSchema", () => {
  it("accepts a single-field update", () => {
    const result = updateBusinessProfileSchema.safeParse({
      companyName: "Acme Pvt Ltd",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a multi-field update", () => {
    const result = updateBusinessProfileSchema.safeParse({
      companyName: "Acme Pvt Ltd",
      city: "Bangalore",
      fundingAsk: 5000000,
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty body", () => {
    const result = updateBusinessProfileSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects a companyName shorter than 2 chars", () => {
    const result = updateBusinessProfileSchema.safeParse({ companyName: "A" });
    expect(result.success).toBe(false);
  });

  it("rejects a negative fundingAsk", () => {
    const result = updateBusinessProfileSchema.safeParse({ fundingAsk: -100 });
    expect(result.success).toBe(false);
  });

  it("coerces fundingAsk string to number", () => {
    const result = updateBusinessProfileSchema.safeParse({ fundingAsk: "5000000" });
    expect(result.success).toBe(true);
    expect(result.data.fundingAsk).toBe(5000000);
  });

  it("rejects non-integer yearsOperating", () => {
    const result = updateBusinessProfileSchema.safeParse({ yearsOperating: 2.5 });
    expect(result.success).toBe(false);
  });

  it("rejects yearsOperating over 100", () => {
    const result = updateBusinessProfileSchema.safeParse({ yearsOperating: 200 });
    expect(result.success).toBe(false);
  });

  it("accepts null for optional verification numbers", () => {
    const result = updateBusinessProfileSchema.safeParse({
      udyamNumber: null,
      gstNumber: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects verificationTier (system-controlled)", () => {
    const result = updateBusinessProfileSchema.safeParse({
      verificationTier: "verified",
    });
    // verificationTier is not in the schema — zod strips it.
    // The refine() then sees an empty object and rejects.
    expect(result.success).toBe(false);
  });

  it("strips unknown fields from a valid payload", () => {
    const result = updateBusinessProfileSchema.safeParse({
      companyName: "Acme Pvt Ltd",
      verificationTier: "verified",   // attacker attempt
      userId: "some-other-uuid",       // attacker attempt
    });
    expect(result.success).toBe(true);
    expect(result.data.verificationTier).toBeUndefined();
    expect(result.data.userId).toBeUndefined();
  });

  it("exposes the required fields list for completeness checks", () => {
    expect(REQUIRED_PROFILE_FIELDS).toEqual([
      "companyName",
      "sector",
      "city",
      "description",
      "fundingAsk",
      "yearsOperating",
    ]);
  });
});