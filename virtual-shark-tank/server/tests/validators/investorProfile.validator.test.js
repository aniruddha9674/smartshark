import { describe, it, expect } from "vitest";
import {
  updateInvestorProfileSchema,
  REQUIRED_INVESTOR_FIELDS,
} from "../../src/validators/investorProfile.validator.js";

describe("updateInvestorProfileSchema", () => {
  it("accepts a single-field update", () => {
    const r = updateInvestorProfileSchema.safeParse({ firmName: "Peak Ventures" });
    expect(r.success).toBe(true);
  });

  it("rejects an empty body", () => {
    const r = updateInvestorProfileSchema.safeParse({});
    expect(r.success).toBe(false);
  });

  it("rejects a firmName shorter than 2 chars", () => {
    const r = updateInvestorProfileSchema.safeParse({ firmName: "A" });
    expect(r.success).toBe(false);
  });

  it("rejects a negative minTicketSize", () => {
    const r = updateInvestorProfileSchema.safeParse({ minTicketSize: -1 });
    expect(r.success).toBe(false);
  });

  it("coerces string numbers", () => {
    const r = updateInvestorProfileSchema.safeParse({ minTicketSize: "500000" });
    expect(r.success).toBe(true);
    expect(r.data.minTicketSize).toBe(500000);
  });

  it("accepts min <= max", () => {
    const r = updateInvestorProfileSchema.safeParse({
      minTicketSize: 500000,
      maxTicketSize: 5000000,
    });
    expect(r.success).toBe(true);
  });

  it("accepts min == max", () => {
    const r = updateInvestorProfileSchema.safeParse({
      minTicketSize: 1000000,
      maxTicketSize: 1000000,
    });
    expect(r.success).toBe(true);
  });

  it("rejects min > max", () => {
    const r = updateInvestorProfileSchema.safeParse({
      minTicketSize: 5000000,
      maxTicketSize: 500000,
    });
    expect(r.success).toBe(false);
    expect(r.error.flatten().fieldErrors.minTicketSize).toBeDefined();
  });

  it("accepts a partial update with only min (max unchanged)", () => {
    const r = updateInvestorProfileSchema.safeParse({ minTicketSize: 1000000 });
    expect(r.success).toBe(true);
  });

  it("accepts null for panNumber", () => {
    const r = updateInvestorProfileSchema.safeParse({ panNumber: null });
    expect(r.success).toBe(true);
  });

  it("rejects isIdentityVerified (system-controlled)", () => {
    const r = updateInvestorProfileSchema.safeParse({
      isIdentityVerified: true,
    });
    // stripped → empty body → refine rejects
    expect(r.success).toBe(false);
  });

  it("strips unknown fields", () => {
    const r = updateInvestorProfileSchema.safeParse({
      firmName: "Peak Ventures",
      isIdentityVerified: true,
      userId: "attacker",
    });
    expect(r.success).toBe(true);
    expect(r.data.isIdentityVerified).toBeUndefined();
    expect(r.data.userId).toBeUndefined();
  });

  it("exposes required fields list", () => {
    expect(REQUIRED_INVESTOR_FIELDS).toEqual([
      "firmName",
      "investmentFocus",
      "preferredGeography",
      "minTicketSize",
      "maxTicketSize",
    ]);
  });
});