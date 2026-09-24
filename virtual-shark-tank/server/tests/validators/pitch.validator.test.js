import { describe, it, expect } from "vitest";
import {
  createPitchSchema,
  updatePitchSchema,
  REQUIRED_TO_PUBLISH,
} from "../../src/validators/pitch.validator.js";

const valid = {
  businessId: "11111111-1111-4111-8111-111111111111",
  title: "Seed Round 2026",
  askAmount: 5000000,
  equityOffered: 8,
};

describe("createPitchSchema", () => {
  it("accepts a minimal valid payload", () => {
    expect(createPitchSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts a fully populated payload", () => {
    const r = createPitchSchema.safeParse({
      ...valid,
      tagline: "Invest in the future of X",
      shortPitch: "We help Y do Z",
      longSummary: "Long form...",
      stage: "mvp",
      revenueRange: "under_10L",
      monthlyGrowthPct: 25,
      teamSize: 5,
      foundedYear: 2024,
      content: { problem: "X is broken", solution: "We fix X" },
      videoUrl: "https://res.cloudinary.com/demo/video.mp4",
      pitchDeckUrl: "https://res.cloudinary.com/demo/deck.pdf",
      coverImageUrl: "https://res.cloudinary.com/demo/cover.jpg",
    });
    expect(r.success).toBe(true);
  });

  it("requires a businessId", () => {
    const { businessId, ...rest } = valid;
    expect(createPitchSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects a non-uuid businessId", () => {
    expect(
      createPitchSchema.safeParse({ ...valid, businessId: "not-a-uuid" }).success
    ).toBe(false);
  });

  it("requires title", () => {
    const { title, ...rest } = valid;
    expect(createPitchSchema.safeParse(rest).success).toBe(false);
  });

  it("requires askAmount", () => {
    const { askAmount, ...rest } = valid;
    expect(createPitchSchema.safeParse(rest).success).toBe(false);
  });

  it("requires equityOffered", () => {
    const { equityOffered, ...rest } = valid;
    expect(createPitchSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects negative askAmount", () => {
    expect(createPitchSchema.safeParse({ ...valid, askAmount: -1 }).success).toBe(false);
  });

  it("rejects equityOffered > 100", () => {
    expect(createPitchSchema.safeParse({ ...valid, equityOffered: 101 }).success).toBe(false);
  });

  it("rejects equityOffered = 0", () => {
    expect(createPitchSchema.safeParse({ ...valid, equityOffered: 0 }).success).toBe(false);
  });

  it("accepts equityOffered = 100", () => {
    expect(createPitchSchema.safeParse({ ...valid, equityOffered: 100 }).success).toBe(true);
  });

  it("coerces string numbers to numeric", () => {
    const r = createPitchSchema.safeParse({
      ...valid,
      askAmount: "5000000",
      equityOffered: "8",
    });
    expect(r.success).toBe(true);
    expect(r.data.askAmount).toBe(5000000);
    expect(r.data.equityOffered).toBe(8);
  });

  it("rejects invalid stage", () => {
    expect(createPitchSchema.safeParse({ ...valid, stage: "unknown" }).success).toBe(false);
  });

  it("rejects invalid revenueRange", () => {
    expect(createPitchSchema.safeParse({ ...valid, revenueRange: "huge" }).success).toBe(false);
  });

  it("rejects foundedYear outside 1900–2100", () => {
    expect(createPitchSchema.safeParse({ ...valid, foundedYear: 1800 }).success).toBe(false);
    expect(createPitchSchema.safeParse({ ...valid, foundedYear: 2200 }).success).toBe(false);
  });

  it("rejects non-positive teamSize", () => {
    expect(createPitchSchema.safeParse({ ...valid, teamSize: 0 }).success).toBe(false);
  });

  it("rejects non-URL for videoUrl", () => {
    expect(createPitchSchema.safeParse({ ...valid, videoUrl: "not-a-url" }).success).toBe(false);
  });

  it("strips unknown fields", () => {
    const r = createPitchSchema.safeParse({
      ...valid,
      status: "live",
      valuation: 999999999,
    });
    expect(r.success).toBe(true);
    expect(r.data.status).toBeUndefined();
    expect(r.data.valuation).toBeUndefined();
  });

  it("accepts a content object with known keys", () => {
    const r = createPitchSchema.safeParse({
      ...valid,
      content: {
        problem: "X is broken",
        solution: "We fix X",
        marketSize: "$5B",
      },
    });
    expect(r.success).toBe(true);
  });

  it("strips unknown keys inside content", () => {
    const r = createPitchSchema.safeParse({
      ...valid,
      content: {
        problem: "X",
        attackerKey: "malicious",
      },
    });
    expect(r.success).toBe(true);
    expect(r.data.content.attackerKey).toBeUndefined();
  });
});

describe("updatePitchSchema", () => {
  it("accepts a single-field update", () => {
    expect(updatePitchSchema.safeParse({ tagline: "New tagline" }).success).toBe(true);
  });

  it("rejects an empty body", () => {
    expect(updatePitchSchema.safeParse({}).success).toBe(false);
  });

  it("accepts null to clear a field", () => {
    expect(updatePitchSchema.safeParse({ tagline: null }).success).toBe(true);
    expect(updatePitchSchema.safeParse({ stage: null }).success).toBe(true);
  });

  it("rejects negative askAmount", () => {
    expect(updatePitchSchema.safeParse({ askAmount: -1 }).success).toBe(false);
  });

  it("rejects equityOffered > 100", () => {
    expect(updatePitchSchema.safeParse({ equityOffered: 150 }).success).toBe(false);
  });

  it("strips status field (not editable by user)", () => {
    const r = updatePitchSchema.safeParse({ status: "live", title: "Test Pitch" });
    expect(r.success).toBe(true);
    expect(r.data.status).toBeUndefined();
  });

  it("strips publishedAt field", () => {
    const r = updatePitchSchema.safeParse({ publishedAt: new Date(), title: "Test Pitch" });
    expect(r.success).toBe(true);
    expect(r.data.publishedAt).toBeUndefined();
  });
});

describe("REQUIRED_TO_PUBLISH", () => {
  it("lists the fields a pitch must have before going live", () => {
    expect(REQUIRED_TO_PUBLISH).toEqual([
      "title",
      "tagline",
      "shortPitch",
      "longSummary",
      "askAmount",
      "equityOffered",
      "stage",
      "revenueRange",
    ]);
  });
});