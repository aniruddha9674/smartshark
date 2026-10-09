import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import authRoutes from "./routes/auth.routes.js";
import { errorHandler } from "./middleware/error.middleware.js";
import swaggerUi from "swagger-ui-express";
import { swaggerSpec } from "./config/swagger.js";
import businessRoutes from "./routes/business.routes.js";
import investorRoutes from "./routes/investor.routes.js";
import pitchRoutes from "./routes/pitch.routes.js";
import followRoutes from "./routes/follow.routes.js";
import conversationRoutes from "./routes/conversation.routes.js";
import offerRoutes from "./routes/offer.routes.js";
import investmentRoutes from "./routes/investment.routes.js";
import uploadRoutes from "./routes/upload.routes.js";
import verificationRoutes from "./routes/verification.routes.js";
import readinessRoutes from "./routes/readiness.routes.js";
import matchRoutes from "./routes/match.routes.js";
import healthRoutes from "./routes/health.routes.js";
import { requestLogger, attachRequestId } from "./middleware/requestId.middleware.js";
import "./config/redis.js";

const app = express();

// ─── 1. Trust Render's proxy so req.ip is the real client IP ───
app.set("trust proxy", 1);

// ─── 2. Request ID + logging (first, so every request is traced) ───
app.use(attachRequestId);
app.use(requestLogger);

// ─── 3. CORS — env-driven, defaults to localhost for dev ───
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",").map((o) => o.trim())
  : ["http://localhost:5173"];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (curl, Postman, same-origin)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);

// ─── 4. Body + cookie parsers ───
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

// ─── 5. Root info route ───
app.get("/", (req, res) => {
  res.json({
    name: "SmartShark API",
    version: "1.0.0",
    status: "running",
    docs: "/docs",
    health: "/api/health",
  });
});

// ─── 6. Health check ───
app.use("/api/health", healthRoutes);

// ─── 7. Swagger docs ───
app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// ─── 8. API routes ───
app.use("/api/auth", authRoutes);
app.use("/api/businesses", businessRoutes);
app.use("/api/businesses", readinessRoutes);
app.use("/api/investor", investorRoutes);
app.use("/api/pitches", pitchRoutes);
app.use("/api/follows", followRoutes);
app.use("/api/conversations", conversationRoutes);
app.use("/api/offers", offerRoutes);
app.use("/api/investments", investmentRoutes);
app.use("/api/uploads", uploadRoutes);
app.use("/api/verifications", verificationRoutes);
app.use("/api/matches", matchRoutes);

// ─── 9. JSON 404 for anything unmatched ───
app.use((req, res) => {
  res.status(404).json({
    error: "Not found",
    path: req.path,
    requestId: req.id,
  });
});

// ─── 10. Error handler (must be last) ───
app.use(errorHandler);

export default app;