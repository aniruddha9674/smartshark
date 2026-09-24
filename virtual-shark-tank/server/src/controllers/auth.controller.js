import * as authService from "../services/auth.service.js";
import { env } from "../config/env.js";

const REFRESH_COOKIE = "refreshToken";

const setRefreshCookie = (res, token) => {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: env.nodeEnv === "production",
    sameSite: "strict",
    maxAge: env.refreshTokenTtlDays * 24 * 60 * 60 * 1000,
    path: "/api/auth",
  });
};

export const register = async (req, res) => {
  const userAgent = req.headers["user-agent"];
  const { user, accessToken, refreshToken } = await authService.registerUser(
    req.body
  );
  setRefreshCookie(res, refreshToken);
  res.status(201).json({ user, accessToken });
};

export const login = async (req, res) => {
  const userAgent = req.headers["user-agent"];
  const { user, accessToken, refreshToken } = await authService.loginUser(
    req.body,
    userAgent
  );
  setRefreshCookie(res, refreshToken);
  res.json({ user, accessToken });
};

export const refresh = async (req, res) => {
  const userAgent = req.headers["user-agent"];
  const raw = req.cookies[REFRESH_COOKIE];
  const { user, accessToken, refreshToken } = await authService.refreshSession(
    raw,
    userAgent
  );
  setRefreshCookie(res, refreshToken);
  res.json({ user, accessToken });
};

export const logout = async (req, res) => {
  const raw = req.cookies[REFRESH_COOKIE];
  await authService.logoutUser(raw);
  res.clearCookie(REFRESH_COOKIE, { path: "/api/auth" });
  res.json({ message: "Logged out" });
};

export const me = async (req, res) => {
  const user = await authService.getCurrentUser(req.user.id);
  res.json({ user });
};