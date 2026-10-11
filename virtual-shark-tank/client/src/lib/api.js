import axios from "axios";
import { API_URL } from "./config";

export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("accessToken");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshing = null;

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;

    if (error.response?.status !== 401 || original._retry) {
      return Promise.reject(error);
    }
    if (original.url?.includes("/api/auth/")) {
      return Promise.reject(error);
    }

    original._retry = true;

    try {
      if (!refreshing) {
        refreshing = axios
          .post(`${API_URL}/api/auth/refresh`, {}, { withCredentials: true })
          .then((res) => {
            const token = res.data.accessToken;
            localStorage.setItem("accessToken", token);
            return token;
          })
          .finally(() => {
            refreshing = null;
          });
      }

      const newToken = await refreshing;
      original.headers.Authorization = `Bearer ${newToken}`;
      return api(original);
    } catch (err) {
      localStorage.removeItem("accessToken");
      window.location.href = "/login";
      return Promise.reject(err);
    }
  }
);

export const getErrorMessage = (error) => {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.error || error.message || "Something went wrong";
  }
  if (error instanceof Error) return error.message;
  return "Something went wrong";
};