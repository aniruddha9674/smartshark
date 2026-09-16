import * as followService from "../services/follow.service.js";

// POST /api/follows/:userId — follow a user
export const follow = async (req, res) => {
  const result = await followService.followUser(req.user.id, req.params.userId);
  res.status(201).json(result);
};

// DELETE /api/follows/:userId — unfollow
export const unfollow = async (req, res) => {
  const result = await followService.unfollowUser(req.user.id, req.params.userId);
  res.json(result);
};

// GET /api/follows/following — who I follow
export const getFollowing = async (req, res) => {
  const result = await followService.getFollowing(req.user.id, {
    limit: req.query.limit,
    offset: req.query.offset,
  });
  res.json(result);
};

// GET /api/follows/followers — who follows me
export const getFollowers = async (req, res) => {
  const result = await followService.getFollowers(req.user.id, {
    limit: req.query.limit,
    offset: req.query.offset,
  });
  res.json(result);
};

// GET /api/follows/status/:userId — am I following this user?
export const getStatus = async (req, res) => {
  const following = await followService.isFollowing(req.user.id, req.params.userId);
  res.json({ following });
};