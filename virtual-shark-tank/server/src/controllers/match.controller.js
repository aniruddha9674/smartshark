import * as matchService from "../services/match.service.js";

export const recomputeForBusiness = async (req, res) => {
  const result = await matchService.recomputeForBusiness(
    req.params.id,
    req.user.id
  );
  res.json(result);
};

export const recomputeForInvestor = async (req, res) => {
  const result = await matchService.recomputeForInvestor(req.user.id);
  res.json(result);
};

const toNumber = (value) => {
  if (value == null || value === "") return undefined;
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
};

export const getInvestorFeed = async (req, res) => {
  const {
    sector,
    minAsk,
    maxAsk,
    verifiedOnly,
    minReadiness,
    sortBy,
  } = req.query;

  const feed = await matchService.getInvestorFeed(req.user.id, {
    minScore: toNumber(req.query.minScore) ?? 0,
    limit: toNumber(req.query.limit) ?? 20,
    offset: toNumber(req.query.offset) ?? 0,
    sector: sector ? String(sector) : undefined,
    minAsk: toNumber(minAsk),
    maxAsk: toNumber(maxAsk),
    verifiedOnly:
      verifiedOnly === true || verifiedOnly === "true" || verifiedOnly === "1",
    minReadiness: toNumber(minReadiness),
    sortBy: ["relevance", "readiness", "newest"].includes(sortBy)
      ? sortBy
      : "relevance",
  });

  res.json({ matches: feed });
};

export const getBusinessFeed = async (req, res) => {
  const feed = await matchService.getBusinessFeed(
    req.params.id,
    req.user.id,
    req.query
  );
  res.json({ matches: feed });
};

export const getOne = async (req, res) => {
  const match = await matchService.getMatch(req.params.id, req.user.id);
  res.json({ match });
};

export const shortlist = async (req, res) => {
  const match = await matchService.shortlistMatch(req.params.id, req.user.id);
  res.json({ match });
};

export const pass = async (req, res) => {
  const match = await matchService.passMatch(req.params.id, req.user.id);
  res.json({ match });
};