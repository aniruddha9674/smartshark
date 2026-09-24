import * as investmentService from "../services/investment.service.js";

export const getMine = async (req, res) => {
  const result = await investmentService.getMyPortfolio(req.user.id, {
    limit: req.query.limit,
    offset: req.query.offset,
  });
  res.json(result);
};

export const getReceived = async (req, res) => {
  const { businessId, limit, offset } = req.query;
  if (!businessId) {
    return res.status(400).json({ error: "businessId query param required" });
  }
  const result = await investmentService.getBusinessInvestments(
    businessId,
    req.user.id,
    { limit, offset }
  );
  res.json(result);
};

export const getOne = async (req, res) => {
  const investment = await investmentService.getInvestment(req.params.id, req.user.id);
  res.json({ investment });
};

export const getSummary = async (req, res) => {
  const summary = await investmentService.getPortfolioSummary(req.user.id);
  res.json(summary);
};