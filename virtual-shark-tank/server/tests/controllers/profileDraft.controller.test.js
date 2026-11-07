import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import app from "../../src/app.js";
import { db } from "../../src/config/db.postgres.js";
import { businesses, users, profileDrafts } from "../../src/models/postgres/index.js";

vi.mock("../../src/services/profileDraft.service.js", () => ({
  draftProfile: vi.fn(),
}));
const { draftProfile } = await import("../../src/services/profileDraft.service.js");

const DEV_USER_ID = "00000000-0000-0000-0000-000000000001";

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

const seedDevUser = async () => {
  await db
    .insert(users)
    .values({
      id: DEV_USER_ID,
      name: "Dev",
      email: "dev@test.local",
      passwordHash: "x",
      isVerified: true,
      isActive: true,
      isAdmin: true,
    })
    .onConflictDoNothing();
};

const authHeader = { "x-dev-user-id": DEV_USER_ID };

describe("profileDraft.controller", () => {
  beforeEach(async () => {
    await db.delete(profileDrafts);
    await db.delete(businesses);
    await db.delete(users);
    await seedDevUser();
    vi.mocked(draftProfile).mockReset();
  });

  describe("POST /api/businesses/:id/profile-draft", () => {
    it("returns 400 for malformed UUID", async () => {
      const res = await request(app)
        .post("/api/businesses/not-a-uuid/profile-draft")
        .set(authHeader);
      expect(res.status).toBe(400);
    });

    it("returns 404 for nonexistent business", async () => {
      const res = await request(app)
        .post("/api/businesses/00000000-0000-0000-0000-000000000099/profile-draft")
        .set(authHeader);
      expect(res.status).toBe(404);
    });

    it("returns 201 with drafts on success", async () => {
      const business = await createBusiness();
      vi.mocked(draftProfile).mockResolvedValue({
        drafts: { sector: { value: "SaaS", confidence: 0.9, source: "llm" } },
        extractionMethods: { sector: "llm" },
        fieldCount: 1,
        sourceUrl: "example.com",
        rawText: "text",
        scrapeCode: null,
        llmCode: null,
      });

      const res = await request(app)
        .post(`/api/businesses/${business.id}/profile-draft`)
        .set(authHeader);

      expect(res.status).toBe(201);
      expect(res.body.drafts.sector.value).toBe("SaaS");
      expect(res.body.scrapeCode).toBeNull();
    });

    it("returns cached draft on second call within 24h", async () => {
      const business = await createBusiness();
      vi.mocked(draftProfile).mockResolvedValue({
        drafts: { sector: { value: "SaaS" } },
        extractionMethods: { sector: "llm" },
        fieldCount: 1,
        sourceUrl: null,
        rawText: null,
        scrapeCode: null,
        llmCode: null,
      });

      // First call — writes row
      await request(app)
        .post(`/api/businesses/${business.id}/profile-draft`)
        .set(authHeader);

      // Second call — should hit cache
      const res = await request(app)
        .post(`/api/businesses/${business.id}/profile-draft`)
        .set(authHeader);

      expect(res.body.cached).toBe(true);
      expect(vi.mocked(draftProfile)).toHaveBeenCalledTimes(1);
    });

    it("does not overwrite a good draft with an empty one", async () => {
      const business = await createBusiness();

      // Seed a good draft first
      await db.insert(profileDrafts).values({
        businessId: business.id,
        drafts: { sector: { value: "Existing" } },
        extractionMethods: { sector: "llm" },
      });

      // Now force a failed draft
      vi.mocked(draftProfile).mockResolvedValue({
        drafts: {},
        extractionMethods: {},
        fieldCount: 0,
        sourceUrl: null,
        rawText: null,
        scrapeCode: "scrape_blocked",
        llmCode: "llm_unavailable",
      });

      const res = await request(app)
        .post(`/api/businesses/${business.id}/profile-draft?refresh=1`)
        .set(authHeader);

      expect(res.body.drafts.sector.value).toBe("Existing");
      expect(res.body.message).toMatch(/couldn't generate/i);
    });

    it("returns 403 when drafting a claimed business owned by someone else", async () => {
      const otherUser = "00000000-0000-0000-0000-000000000002";
      await db.insert(users).values({
        id: otherUser,
        name: "Other",
        email: "other@test.local",
        passwordHash: "x",
        isVerified: true,
        isActive: true,
        isAdmin: false,
      });
      const business = await createBusiness({ ownerId: otherUser });

      const res = await request(app)
        .post(`/api/businesses/${business.id}/profile-draft`)
        .set(authHeader);

      expect(res.status).toBe(403);
    });
  });

  describe("GET /api/businesses/:id/profile-draft", () => {
    it("returns 404 when no draft exists", async () => {
      const business = await createBusiness();
      const res = await request(app)
        .get(`/api/businesses/${business.id}/profile-draft`)
        .set(authHeader);
      expect(res.status).toBe(404);
    });

    it("returns the stored draft", async () => {
      const business = await createBusiness();
      await db.insert(profileDrafts).values({
        businessId: business.id,
        drafts: { sector: { value: "SaaS" } },
        extractionMethods: { sector: "llm" },
      });

      const res = await request(app)
        .get(`/api/businesses/${business.id}/profile-draft`)
        .set(authHeader);

      expect(res.status).toBe(200);
      expect(res.body.drafts.sector.value).toBe("SaaS");
      expect(res.body.extractionMethods.sector).toBe("llm");
    });
  });
});