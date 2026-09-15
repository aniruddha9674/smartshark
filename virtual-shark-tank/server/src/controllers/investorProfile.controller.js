import * as investorProfileService from "../services/investorProfile.service.js";

export const getMe = async (req, res) => {
  const profile = await investorProfileService.getInvestorProfile(req.user.id);
  res.json({ profile });
};

export const updateMe = async (req, res) => {
  const profile = await investorProfileService.updateInvestorProfile(
    req.user.id,
    req.body
  );
  res.json({ profile });
};

export const complete = async (req, res) => {
  const result = await investorProfileService.completeInvestorProfile(req.user.id);
  res.json(result);
};