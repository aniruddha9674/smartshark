import * as businessService from "../services/businessProfile.service.js";
import * as investorBriefService from "../services/investorBrief.service.js";

// GET /api/businesses — list all businesses I own
export const listMine = async (req, res) => {
  const businesses = await businessService.listMyBusinesses(req.user.id);
  res.json({ businesses });
};

// POST /api/businesses — create a new business
export const create = async (req, res) => {
  const business = await businessService.createBusiness(req.user.id, req.body);
  res.status(201).json({ business });
};

// GET /api/businesses/:id
export const getOne = async (req, res) => {
  const business = await businessService.getBusiness(req.params.id, req.user.id);
  res.json({ business });
};

// PATCH /api/businesses/:id
export const update = async (req, res) => {
  const business = await businessService.updateBusiness(
    req.params.id,
    req.user.id,
    req.body
  );
  res.json({ business });
};

// POST /api/businesses/:id/complete
export const complete = async (req, res) => {
  const result = await businessService.completeBusiness(
    req.params.id,
    req.user.id
  );
  res.json(result);
};

// GET /api/businesses/:id/history
export const getHistory = async (req, res) => {
  const history = await businessService.getBusinessHistory(
    req.params.id,
    req.user.id
  );
  res.json({ history });
};

export const getPublic = async (req, res) => {
  const business = await businessService.getPublicBusiness(req.params.id);
  res.json({ business });
};

export const getCompanyProfile = async (req, res) => {
  const profile = await businessService.getCompanyProfile(req.params.id);
  res.json(profile);
};

export const getInvestorBrief = async (req, res) => {
  const result = await investorBriefService.getBrief(req.params.id, {
    forceRegenerate: req.query.regenerate === "true",
  });
  if (result.error === "not_found") {
    return res.status(404).json({ error: "Business not found" });
  }
  if (result.error === "insufficient_data") {
    return res.json({ brief: null, reason: "insufficient_data" });
  }
  if (result.error === "generation_failed") {
  return res.status(503).json({
    error: "Brief generation failed",
    detail: process.env.NODE_ENV !== "production" ? result.detail : undefined,
  });
}
  res.json(result);
};