import * as readinessService from "../services/readiness.service.js";
import { ApiError } from "../utils/apiError.js";

export const recomputeReadiness = async (req, res) => {
  const readiness = await readinessService.recomputeReadiness(
    req.params.id,
    req.user.id
  );
  if (!readiness) throw ApiError.notFound("Business not found");
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