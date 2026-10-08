import { randomUUID } from "crypto";
import pinoHttp from "pino-http";
import { logger } from "../config/logger.js";

export const requestLogger = pinoHttp({
  logger,
  genReqId: (req) => req.headers["x-request-id"] || randomUUID(),
  customLogLevel: (req, res) => {
    if (res.statusCode >= 500) return "error";
    if (res.statusCode >= 400) return "warn";
    return "info";
  },
  customSuccessMessage: (req, res) =>
    `${req.method} ${req.url} ${res.statusCode}`,
  autoLogging: {
    ignore: (req) => req.url === "/api/health",
  },
});

export const attachRequestId = (req, res, next) => {
  req.id = req.id || randomUUID();
  res.setHeader("X-Request-Id", req.id);
  next();
};