import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

export const useMessages = (conversationId) => {
  return useQuery({
    queryKey: ["messages", conversationId],
    enabled: !!conversationId,
    queryFn: async () => {
      const res = await api.get(`/api/conversations/${conversationId}/messages`);
      const data = res.data;
      if (Array.isArray(data)) return data;
      return data?.messages ?? [];
    },
    refetchInterval: 5_000,
  });
};

export const useSendMessage = (conversationId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) =>
      api.post(`/api/conversations/${conversationId}/messages`, { body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["messages", conversationId] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
};

export const useMarkRead = (conversationId) => {
  return useMutation({
    mutationFn: () => api.post(`/api/conversations/${conversationId}/read`),
  });
};