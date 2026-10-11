import { create } from "zustand";
import { api } from "../lib/api";

export const useAuth = create((set) => ({
  user: null,
  loading: true,

  login: async (email, password) => {
    const res = await api.post("/api/auth/login", { email, password });
    localStorage.setItem("accessToken", res.data.accessToken);
    set({ user: res.data.user });
  },

  register: async (data) => {
    const res = await api.post("/api/auth/register", data);
    localStorage.setItem("accessToken", res.data.accessToken);
    set({ user: res.data.user });
  },

  logout: async () => {
    await api.post("/api/auth/logout").catch(() => {});
    localStorage.removeItem("accessToken");
    set({ user: null });
  },

  loadUser: async () => {
    try {
      const res = await api.get("/api/auth/me");
      set({ user: res.data.user });
    } catch {
      set({ user: null });
    } finally {
      set({ loading: false });
    }
  },
}));