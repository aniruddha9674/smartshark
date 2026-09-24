import { describe, it, expect } from "vitest";
import {
  createOfferSchema,
  counterOfferSchema,
  OFFER_DEFAULT_EXPIRY_DAYS,
  OFFER_MAX_COUNTER_DEPTH,
  MAX_OFFERS_PER_DAY,
} from "../../src/validators/offer.validator.js";

describe("createOfferSchema", () => {
  const valid = {
    pitchId: "11111111-1111-4111-8111-111111111111",
    amount: 5000000,
    equityRequested: 8,
  };

  it("accepts a minimal valid payload", () => {
    expect(createOfferSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts a fully populated payload", () => {
    expect(
      createOfferSchema.safeParse({
        ...valid,
        conditions: { milestone: "Series A", board_seat: true },
        message: "Happy to discuss terms",
        expiresInDays: 14,
      }).success
    ).toBe(true);
  });

  it("requires pitchId", () => {
    const { pitchId, ...rest } = valid;
    expect(createOfferSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects a non-uuid pitchId", () => {
    expect(
      createOfferSchema.safeParse({ ...valid, pitchId: "not-a-uuid" }).success
    ).toBe(false);
  });

  it("requires amount", () => {
    const { amount, ...rest } = valid;
    expect(createOfferSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects a negative amount", () => {
    expect(createOfferSchema.safeParse({ ...valid, amount: -1 }).success).toBe(false);
  });

  it("rejects amount = 0", () => {
    expect(createOfferSchema.safeParse({ ...valid, amount: 0 }).success).toBe(false);
  });

  it("coerces string amount to number", () => {
    const r = createOfferSchema.safeParse({ ...valid, amount: "5000000" });
    expect(r.success).toBe(true);
    expect(r.data.amount).toBe(5000000);
  });

  it("rejects equityRequested > 100", () => {
    expect(
      createOfferSchema.safeParse({ ...valid, equityRequested: 101 }).success
    ).toBe(false);
  });

  it("accepts equityRequested = 100", () => {
    expect(
      createOfferSchema.safeParse({ ...valid, equityRequested: 100 }).success
    ).toBe(true);
  });

  it("rejects equityRequested = 0", () => {
    expect(
      createOfferSchema.safeParse({ ...valid, equityRequested: 0 }).success
    ).toBe(false);
  });

  it("rejects message over 2000 chars", () => {
    expect(
      createOfferSchema.safeParse({ ...valid, message: "x".repeat(2001) }).success
    ).toBe(false);
  });

  it("rejects expiresInDays > 30", () => {
    expect(
      createOfferSchema.safeParse({ ...valid, expiresInDays: 31 }).success
    ).toBe(false);
  });

  it("rejects expiresInDays < 1", () => {
    expect(
      createOfferSchema.safeParse({ ...valid, expiresInDays: 0 }).success
    ).toBe(false);
  });

  it("strips unknown fields", () => {
    const r = createOfferSchema.safeParse({
      ...valid,
      status: "accepted",       // attacker attempt
      investorId: "attacker",   // attacker attempt
      businessId: "attacker",
    });
    expect(r.success).toBe(true);
    expect(r.data.status).toBeUndefined();
    expect(r.data.investorId).toBeUndefined();
    expect(r.data.businessId).toBeUndefined();
  });
});

describe("counterOfferSchema", () => {
  const valid = { amount: 6000000, equityRequested: 10 };

  it("accepts a valid counter", () => {
    expect(counterOfferSchema.safeParse(valid).success).toBe(true);
  });

  it("requires amount", () => {
    const { amount, ...rest } = valid;
    expect(counterOfferSchema.safeParse(rest).success).toBe(false);
  });

  it("requires equityRequested", () => {
    const { equityRequested, ...rest } = valid;
    expect(counterOfferSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects a negative amount", () => {
    expect(counterOfferSchema.safeParse({ ...valid, amount: -1 }).success).toBe(false);
  });

  it("strips status/investorId/businessId", () => {
    const r = counterOfferSchema.safeParse({
      ...valid,
      status: "accepted",
      parentOfferId: "attacker",
    });
    expect(r.success).toBe(true);
    expect(r.data.status).toBeUndefined();
    expect(r.data.parentOfferId).toBeUndefined();
  });
});

describe("constants", () => {
  it("exposes the default expiry", () => {
    expect(OFFER_DEFAULT_EXPIRY_DAYS).toBe(7);
  });

  it("exposes max counter depth", () => {
    expect(OFFER_MAX_COUNTER_DEPTH).toBe(10);
  });

  it("exposes max offers per day", () => {
    expect(MAX_OFFERS_PER_DAY).toBe(20);
  });
});