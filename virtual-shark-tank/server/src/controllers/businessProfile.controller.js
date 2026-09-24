import * as businessService from "../services/businessProfile.service.js";

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