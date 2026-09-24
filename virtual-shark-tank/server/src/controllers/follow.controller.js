import * as followService from "../services/follow.service.js";

// POST /api/follows/business/:id — follow a business
export const followBusiness = async (req, res) => {
  const result = await followService.followBusiness(req.user.id, req.params.id);
  res.status(201).json(result);
};

// DELETE /api/follows/business/:id
export const unfollowBusiness = async (req, res) => {
  const result = await followService.unfollowBusiness(req.user.id, req.params.id);
  res.json(result);
};

// POST /api/follows/investor/:id — follow an investor
export const followInvestor = async (req, res) => {
  const result = await followService.followInvestor(req.user.id, req.params.id);
  res.status(201).json(result);
};

// DELETE /api/follows/investor/:id
export const unfollowInvestor = async (req, res) => {
  const result = await followService.unfollowInvestor(req.user.id, req.params.id);
  res.json(result);
};

// GET /api/follows/following — businesses + investors I follow
export const getFollowing = async (req, res) => {
  const result = await followService.getFollowing(req.user.id, {
    limit: req.query.limit,
    offset: req.query.offset,
  });
  res.json(result);
};

// GET /api/follows/business/:id/followers — only the owner sees this
export const getBusinessFollowers = async (req, res) => {
  const result = await followService.getBusinessFollowers(
    req.params.id,
    req.user.id,
    { limit: req.query.limit, offset: req.query.offset }
  );
  res.json(result);
};

// GET /api/follows/investor/followers — who follows me as an investor
export const getInvestorFollowers = async (req, res) => {
  const result = await followService.getInvestorFollowers(req.user.id, {
    limit: req.query.limit,
    offset: req.query.offset,
  });
  res.json(result);
};

// GET /api/follows/status/business/:id
export const getBusinessStatus = async (req, res) => {
  const following = await followService.isFollowingBusiness(req.user.id, req.params.id);
  res.json({ following });
};

// GET /api/follows/status/investor/:id
export const getInvestorStatus = async (req, res) => {
  const following = await followService.isFollowingInvestor(req.user.id, req.params.id);
  res.json({ following });
};