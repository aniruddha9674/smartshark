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


const app = express();

app.use(cors({
  origin: "http://localhost:5173", // your frontend
  credentials: true,               // allow cookies
}));
app.use(express.json());
app.use(cookieParser());

app.get("/health", (req, res) => res.json({ ok: true }));
app.use("/api/auth", authRoutes);
app.use("/api/business", businessRoutes); 
app.use("/api/investor", investorRoutes);
app.use("/api/pitches", pitchRoutes);

app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.use(errorHandler);

export default app;