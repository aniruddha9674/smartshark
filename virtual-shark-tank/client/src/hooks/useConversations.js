import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

export const useConversations = () => {
  return useQuery({
    queryKey: ["conversations"],
    queryFn: async () => {
      const res = await api.get("/api/conversations");
      const data = res.data;
      if (Array.isArray(data)) return data;
      return data?.conversations ?? [];
    },
  });
};

export const useUnreadMessageCount = () => {
  return useQuery({
    queryKey: ["unread-messages"],
    queryFn: async () => {
      const res = await api.get("/api/conversations/unread-count");
      return res.data?.count ?? 0;
    },
    refetchInterval: 30_000,
  });
};