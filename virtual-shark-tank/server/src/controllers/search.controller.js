import * as searchService from "../services/search.service.js";

export const search = async (req, res) => {
  const { q, limit, offset } = req.query;

  if (!q || q.trim().length < 2) {
    return res.json({ businesses: [], total: 0 });
  }

  const result = await searchService.searchBusinesses(q, req.user.id, {
    limit: Number(limit) || 20,
    offset: Number(offset) || 0,
  });

  res.json({
    businesses: result.results,
    total: result.total,
    query: q,
  });
};