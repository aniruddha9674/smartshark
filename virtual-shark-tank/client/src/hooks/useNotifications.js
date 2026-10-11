import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

export const useNotifications = () => {
  return useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      const res = await api.get("/api/notifications");
      const data = res.data;
      if (Array.isArray(data)) return data;
      return data?.notifications ?? [];
    },
  });
};

export const useUnreadNotificationCount = () => {
  return useQuery({
    queryKey: ["unread-notifications"],
    queryFn: async () => {
      const res = await api.get("/api/notifications/unread-count");
      return res.data?.count ?? 0;
    },
    refetchInterval: 30_000,
  });
};

export const useMarkNotificationRead = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.post(`/api/notifications/${id}/read`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.invalidateQueries({ queryKey: ["unread-notifications"] });
    },
  });
};

export const useMarkAllNotificationsRead = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post("/api/notifications/read-all"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.invalidateQueries({ queryKey: ["unread-notifications"] });
    },
  });
};