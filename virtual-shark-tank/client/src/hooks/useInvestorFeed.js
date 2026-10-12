import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

export const useInvestorFeed = (params = {}) => {
  return useQuery({
    queryKey: ["investor-feed", params],
    queryFn: async () => {
      const res = await api.get("/api/matches/investor/feed", {
        params: {
          limit: params.limit ?? 20,
          offset: params.offset ?? 0,
          minScore: params.minScore ?? 0,
        },
      });
      const data = res.data;
      if (Array.isArray(data)) return data;
      return data?.matches ?? [];
    },
    keepPreviousData: true,
  });
};