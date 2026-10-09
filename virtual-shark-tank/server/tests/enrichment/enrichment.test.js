import { describe, it, expect, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../../src/config/db.postgres.js";
import { users, businesses } from "../../src/models/postgres/index.js";
import { enrichBusiness, enrichPending } from "../../src/services/enrichment.service.js";

const seedBusiness = async (overrides = {}) => {
  const [user] = await db
    .insert(users)
    .values({
      name: "System",
      email: `sys-${Date.now()}-${Math.random()}@example.com`,
      passwordHash: "x",
      role: "admin",
      isActive: false,
    })
    .returning();

  const [biz] = await db
    .insert(businesses)
    .values({
      ownerId: user.id,
      companyName: "Test Co",
      sector: "saas",
      isExternal: true,
      enrichmentStatus: "pending",
      ...overrides,
    })
    .returning();

  return biz;
};

describe("enrichment.service", () => {
  beforeEach(async () => {
    await db.delete(businesses);
    await db.delete(users);
    vi.restoreAllMocks();
    process.env.BRANDFETCH_CLIENT_ID = "test-client-id";
  });

  it("builds a Brandfetch logo URL from websiteUrl", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] }),
    });

    const biz = await seedBusiness({ websiteUrl: "https://acme.com" });
    const updated = await enrichBusiness(biz.id);

    expect(updated.logoUrl).toContain("cdn.brandfetch.io/acme.com");
    expect(updated.logoUrl).toContain("c=test-client-id");
    expect(updated.enrichmentStatus).toBe("partial");
  });

  it("strips www and normalizes domain", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({ ok: true, json: async () => ({ results: [] }) });

    const biz = await seedBusiness({ websiteUrl: "www.Acme.COM" });
    const updated = await enrichBusiness(biz.id);

    expect(updated.logoUrl).toContain("cdn.brandfetch.io/acme.com");
  });

  it("sets logoUrl null when websiteUrl missing", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({ ok: true, json: async () => ({ results: [] }) });

    const biz = await seedBusiness({ websiteUrl: null });
    const updated = await enrichBusiness(biz.id);

    expect(updated.logoUrl).toBeNull();
    expect(updated.enrichmentStatus).toBe("skipped");
  });

  it("stores a cover image from Unsplash", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{ urls: { regular: "https://images.unsplash.com/photo-123" } }],
      }),
    });

    const biz = await seedBusiness({ websiteUrl: "https://acme.com", sector: "foodtech" });
    const updated = await enrichBusiness(biz.id);

    expect(updated.coverImageUrl).toBe("https://images.unsplash.com/photo-123");
    expect(updated.enrichmentStatus).toBe("enriched");
  });

  it("handles Unsplash failure gracefully", async () => {
    vi.spyOn(global, "fetch").mockRejectedValue(new Error("503"));

    const biz = await seedBusiness({ websiteUrl: "https://acme.com" });
    const updated = await enrichBusiness(biz.id);

    expect(updated.logoUrl).toBeTruthy();
    expect(updated.coverImageUrl).toBeNull();
    expect(updated.enrichmentStatus).toBe("partial");
  });

  it("enrichPending processes only pending rows", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({ ok: true, json: async () => ({ results: [] }) });

    await seedBusiness({ websiteUrl: "https://a.com", enrichmentStatus: "pending" });
    await seedBusiness({ websiteUrl: "https://b.com", enrichmentStatus: "enriched" });
    await seedBusiness({ websiteUrl: "https://c.com", enrichmentStatus: "pending" });

    const results = await enrichPending({ limit: 10 });

    expect(results.processed).toBe(2);
  });
});