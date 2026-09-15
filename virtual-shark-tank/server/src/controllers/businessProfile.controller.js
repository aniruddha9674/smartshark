import * as businessProfileService from "../services/businessProfile.service.js";

// GET /api/business/me
export const getMe = async (req, res) => {
  const profile = await businessProfileService.getBusinessProfile(req.user.id);
  res.json({ profile });
};

// PATCH /api/business/me
export const updateMe = async (req, res) => {
  const profile = await businessProfileService.updateBusinessProfile(
    req.user.id,   // whose profile
    req.user.id,   // who is editing (always self for now)
    req.body       // already validated + stripped by middleware
  );
  res.json({ profile });
};

// POST /api/business/complete
export const complete = async (req, res) => {
  const result = await businessProfileService.completeBusinessProfile(req.user.id);
  res.json(result);
};

// GET /api/business/history
export const getHistory = async (req, res) => {
  const history = await businessProfileService.getBusinessProfileHistory(
    req.user.id
  );
  res.json({ history });
};