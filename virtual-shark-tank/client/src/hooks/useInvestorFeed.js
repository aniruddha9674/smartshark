import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

export const useInvestorFeed = (params = {}) => {
  return useQuery({
    queryKey: ["investor-feed", params],
    queryFn: async () => {
      const res = await api.get("/api/matches/investor/feed", { params });
      return res.data.matches;
    },
  });
};