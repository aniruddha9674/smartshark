import * as investorProfileService from "../services/investorProfile.service.js";

// POST /api/investor/me — become an investor (idempotent)
export const createOrGet = async (req, res) => {
  const { profile, created } = await investorProfileService.createInvestorProfile(
    req.user.id
  );
  res.status(created ? 201 : 200).json({ profile });
};

// GET /api/investor/me
export const getMe = async (req, res) => {
  const profile = await investorProfileService.getInvestorProfile(req.user.id);
  res.json({ profile });
};

// PATCH /api/investor/me
export const updateMe = async (req, res) => {
  const profile = await investorProfileService.updateInvestorProfile(
    req.user.id,
    req.body
  );
  res.json({ profile });
};

// POST /api/investor/complete
export const complete = async (req, res) => {
  const result = await investorProfileService.completeInvestorProfile(req.user.id);
  res.json(result);
};