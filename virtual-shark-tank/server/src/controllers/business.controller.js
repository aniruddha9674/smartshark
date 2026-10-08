import * as readinessService from "../services/readiness.service.js";

export const recomputeReadiness = async (req, res) => {
  const readiness = await readinessService.computeReadiness(
    req.params.id,
    req.user.id
  );
  res.status(201).json({ readiness });
};

export const getReadiness = async (req, res) => {
  const readiness = await readinessService.getLatestReadiness(
    req.params.id,
    req.user.id
  );
  res.json({ readiness });
};

export const getReadinessTrend = async (req, res) => {
  const trend = await readinessService.getReadinessTrend(
    req.params.id,
    req.user.id,
    req.query.days
  );
  res.json({ trend });
};