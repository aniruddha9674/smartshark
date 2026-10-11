import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

export const useMatch = (matchId) => {
  return useQuery({
    queryKey: ["match", matchId],
    enabled: !!matchId,
    queryFn: async () => {
      const res = await api.get(`/api/matches/${matchId}`);
      return res.data.match;
    },
  });
};