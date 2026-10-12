import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

export const useMatch = (matchId) => {
  const validId = matchId && matchId !== "undefined" ? matchId : undefined;

  return useQuery({
    queryKey: ["match", validId],
    enabled: !!validId,
    queryFn: async () => {
      const res = await api.get(`/api/matches/${validId}`);
      return res.data.match;
    },
  });
};