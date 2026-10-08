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

export const getInvestorFeed = async (req, res) => {
  const feed = await matchService.getInvestorFeed(req.user.id, req.query);
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