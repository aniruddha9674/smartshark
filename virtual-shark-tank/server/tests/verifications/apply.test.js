import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import app from "../../src/app.js";
import { db } from "../../src/config/db.postgres.js";
import {
  users,
  businesses,
  profileEditHistory,
} from "../../src/models/postgres/index.js";
import { Verification } from "../../src/models/mongo/verification.model.js";
import * as extractionService from "../../src/services/extraction.service.js";

const setupBusiness = async () => {
  const email = `ap-${Date.now()}-${Math.random()}@example.com`;
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

const createVerification = async (token, businessId, documentType, fields) => {
  vi.spyOn(extractionService, "extractFromDocument").mockResolvedValueOnce({
    fields,
    overallConfidence: 0.95,
    raw: "{}",
    wrongDocument: false,
  });

  const res = await request(app)
    .post("/api/verifications")
    .set("Authorization", `Bearer ${token}`)
    .send({
      businessId,
      documentType,
      documentUrl: "https://res.cloudinary.com/demo/sample.png",
    })
    .expect(201);

  return res.body.verification;
};

describe("POST /api/verifications/:id/apply", () => {
  beforeEach(async () => {
    await db.delete(profileEditHistory);
    await db.delete(businesses);
    await db.delete(users);
    await Verification.deleteMany({});
    vi.restoreAllMocks();
  });

 it("applies OCR fields to empty profile fields", async () => {
  const { token, businessId } = await setupBusiness();

  const v = await createVerification(token, businessId, "udyam", {
    enterprise_name: { value: "Acme Pvt Ltd", confidence: 0.95 },
    udyam_registration_number: { value: "UDYAM-XX-00-0000000", confidence: 0.97 },
  });

  const res = await request(app)
    .post(`/api/verifications/${v._id}/apply`)
    .set("Authorization", `Bearer ${token}`)
    .send({})
    .expect(200);

  // udyamNumber is empty on the new business → gets applied
  // companyName already matches → no-op, not in appliedFields, no conflict
  expect(res.body.appliedFields).toContain("udyamNumber");
  expect(res.body.appliedFields).not.toContain("companyName");
  expect(res.body.conflicts).toEqual([]);
  expect(res.body.newTier).toBe("basic");
});

  it("upgrades to 'verified' when two docs agree on company name", async () => {
    const { token, businessId } = await setupBusiness();

    const v1 = await createVerification(token, businessId, "udyam", {
      enterprise_name: { value: "Acme Pvt Ltd", confidence: 0.95 },
      udyam_registration_number: { value: "UDYAM-XX-00-0000000", confidence: 0.97 },
    });
    await request(app)
      .post(`/api/verifications/${v1._id}/apply`)
      .set("Authorization", `Bearer ${token}`)
      .send({})
      .expect(200);

    const v2 = await createVerification(token, businessId, "gst", {
      legal_name: { value: "Acme Pvt Ltd", confidence: 0.96 },
      gstin: { value: "29ABCDE1234F1Z5", confidence: 0.98 },
    });
    const res = await request(app)
      .post(`/api/verifications/${v2._id}/apply`)
      .set("Authorization", `Bearer ${token}`)
      .send({})
      .expect(200);

    expect(res.body.newTier).toBe("verified");
  });

  it("stays at 'basic' when two docs disagree on company name", async () => {
    const { token, businessId } = await setupBusiness();

    const v1 = await createVerification(token, businessId, "udyam", {
      enterprise_name: { value: "Acme Pvt Ltd", confidence: 0.95 },
    });
    await request(app)
      .post(`/api/verifications/${v1._id}/apply`)
      .set("Authorization", `Bearer ${token}`)
      .send({})
      .expect(200);

    const v2 = await createVerification(token, businessId, "gst", {
      legal_name: { value: "Different Name Inc", confidence: 0.96 },
    });
    const res = await request(app)
      .post(`/api/verifications/${v2._id}/apply`)
      .set("Authorization", `Bearer ${token}`)
      .send({})
      .expect(200);

    expect(res.body.newTier).toBe("basic");
  });

  it("writes to profile_edit_history", async () => {
    const { token, businessId } = await setupBusiness();
    // Clear the auto-created companyName
    await db.update(businesses).set({ companyName: "" });

    const v = await createVerification(token, businessId, "udyam", {
      enterprise_name: { value: "Acme Pvt Ltd", confidence: 0.95 },
    });

    await request(app)
      .post(`/api/verifications/${v._id}/apply`)
      .set("Authorization", `Bearer ${token}`)
      .send({})
      .expect(200);

    const history = await db.select().from(profileEditHistory);
    expect(history.length).toBeGreaterThan(0);
    expect(history[0].fieldName).toBe("companyName");
    expect(history[0].newValue).toBe("Acme Pvt Ltd");
  });

  it("403 for a verification I don't own", async () => {
    const owner = await setupBusiness();
    const attacker = await setupBusiness();

    const v = await createVerification(owner.token, owner.businessId, "udyam", {
      enterprise_name: { value: "Acme Pvt Ltd", confidence: 0.95 },
    });

    await request(app)
      .post(`/api/verifications/${v._id}/apply`)
      .set("Authorization", `Bearer ${attacker.token}`)
      .send({})
      .expect(403);
  });

  it("400 when applying a rejected verification", async () => {
    const { token, businessId } = await setupBusiness();

    vi.spyOn(extractionService, "extractFromDocument").mockResolvedValueOnce({
      fields: {},
      overallConfidence: 0,
      raw: '{"error":"wrong_document"}',
      wrongDocument: true,
    });

    const createRes = await request(app)
      .post("/api/verifications")
      .set("Authorization", `Bearer ${token}`)
      .send({
        businessId,
        documentType: "udyam",
        documentUrl: "https://res.cloudinary.com/demo/sample.png",
      })
      .expect(201);

    await request(app)
      .post(`/api/verifications/${createRes.body.verification._id}/apply`)
      .set("Authorization", `Bearer ${token}`)
      .send({})
      .expect(400);
  });
});