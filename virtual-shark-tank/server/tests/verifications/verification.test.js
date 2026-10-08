import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import app from "../../src/app.js";
import { db } from "../../src/config/db.postgres.js";
import { users, businesses } from "../../src/models/postgres/index.js";
import { Verification } from "../../src/models/mongo/verification.model.js";
import * as extractionService from "../../src/services/extraction.service.js";

const registerAndCreateBusiness = async () => {
  const email = `v-${Date.now()}-${Math.random()}@example.com`;
  const reg = await request(app)
    .post("/api/auth/register")
    .send({ name: "Biz", email, password: "Password123", role: "business" })
    .expect(201);

  const biz = await request(app)
    .post("/api/businesses")
    .set("Authorization", `Bearer ${reg.body.accessToken}`)
    .send({ companyName: "Acme Pvt Ltd" })
    .expect(201);

  return {
    user: reg.body.user,
    token: reg.body.accessToken,
    businessId: biz.body.business.id,
  };
};

describe("Verification endpoints", () => {
 beforeEach(async () => {
  await db.delete(businesses);
  await db.delete(users);
  await Verification.deleteMany({});
  vi.restoreAllMocks();
});

  it("creates a verification and extracts fields", async () => {
    vi.spyOn(extractionService, "extractFromDocument").mockResolvedValue({
      fields: {
        enterprise_name: { value: "Acme Pvt Ltd", confidence: 0.95 },
        udyam_registration_number: { value: "UDYAM-XX-00-0000000", confidence: 0.98 },
      },
      overallConfidence: 0.965,
      raw: "{}",
      wrongDocument: false,
    });

    const { token, businessId } = await registerAndCreateBusiness();

    const res = await request(app)
      .post("/api/verifications")
      .set("Authorization", `Bearer ${token}`)
      .send({
        businessId,
        documentType: "udyam",
        documentUrl: "https://res.cloudinary.com/demo/image/upload/sample.png",
      })
      .expect(201);

    expect(res.body.verification.status).toBe("verified");
    expect(res.body.verification.confidenceScore).toBeCloseTo(0.965, 2);
    expect(res.body.verification.ocrExtractedData.enterprise_name.value).toBe("Acme Pvt Ltd");
  });

  it("marks needs_review when confidence is low", async () => {
    vi.spyOn(extractionService, "extractFromDocument").mockResolvedValue({
      fields: { enterprise_name: { value: null, confidence: 0.2 } },
      overallConfidence: 0.2,
      raw: "{}",
      wrongDocument: false,
    });

    const { token, businessId } = await registerAndCreateBusiness();
    const res = await request(app)
      .post("/api/verifications")
      .set("Authorization", `Bearer ${token}`)
      .send({
        businessId,
        documentType: "udyam",
        documentUrl: "https://res.cloudinary.com/demo/image/upload/sample.png",
      })
      .expect(201);

    expect(res.body.verification.status).toBe("needs_review");
  });

  it("403 for a business I don't own", async () => {
    const owner = await registerAndCreateBusiness();
    const attacker = await registerAndCreateBusiness();

    await request(app)
      .post("/api/verifications")
      .set("Authorization", `Bearer ${attacker.token}`)
      .send({
        businessId: owner.businessId,
        documentType: "udyam",
        documentUrl: "https://res.cloudinary.com/demo/image/upload/sample.png",
      })
      .expect(403);
  });

  it("400 for invalid document type", async () => {
    const { token, businessId } = await registerAndCreateBusiness();
    await request(app)
      .post("/api/verifications")
      .set("Authorization", `Bearer ${token}`)
      .send({
        businessId,
        documentType: "pan",
        documentUrl: "https://res.cloudinary.com/demo/image/upload/sample.png",
      })
      .expect(400);
  });

  it("lists my verifications", async () => {
    vi.spyOn(extractionService, "extractFromDocument").mockResolvedValue({
      fields: {},
      overallConfidence: 0.8,
      raw: "{}",
      wrongDocument: false,
    });

    const { token, businessId } = await registerAndCreateBusiness();
    await request(app)
      .post("/api/verifications")
      .set("Authorization", `Bearer ${token}`)
      .send({
        businessId,
        documentType: "gst",
        documentUrl: "https://res.cloudinary.com/demo/image/upload/sample.png",
      })
      .expect(201);

    const res = await request(app)
      .get("/api/verifications/me")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(res.body.verifications.length).toBe(1);
  });
});