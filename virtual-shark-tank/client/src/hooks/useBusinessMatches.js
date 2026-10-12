import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

export const useBusinessMatches = (businessId, params = {}) => {
  return useQuery({
    queryKey: ["business-matches", businessId, params],
    enabled: !!businessId,
    queryFn: async () => {
      const res = await api.get(`/api/matches/business/${businessId}/feed`, {
        params,
      });
      const data = res.data;
      if (Array.isArray(data)) return data;
      return data?.matches ?? [];
    },
  });
};