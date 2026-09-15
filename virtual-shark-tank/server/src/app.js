import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import authRoutes from "./routes/auth.routes.js";
import { errorHandler } from "./middleware/error.middleware.js";

const app = express();

app.use(cors({
  origin: "http://localhost:5173", // your frontend
  credentials: true,               // allow cookies
}));
app.use(express.json());
app.use(cookieParser());

app.get("/health", (req, res) => res.json({ ok: true }));
app.use("/api/auth", authRoutes);

app.use(errorHandler);

export default app;