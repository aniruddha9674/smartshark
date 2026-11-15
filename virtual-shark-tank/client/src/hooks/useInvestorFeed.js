import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

const buildQueryParams = (params = {}) => {
  const query = {
    limit: params.limit ?? 20,
    offset: params.offset ?? 0,
    minScore: params.minScore ?? 0,
  };

  if (params.sector) query.sector = params.sector;
  if (params.minAsk != null && params.minAsk !== "") query.minAsk = params.minAsk;
  if (params.maxAsk != null && params.maxAsk !== "") query.maxAsk = params.maxAsk;
  if (params.verifiedOnly) query.verifiedOnly = true;
  if (params.minReadiness != null && params.minReadiness !== "") {
    query.minReadiness = params.minReadiness;
  }
  if (params.sortBy && params.sortBy !== "relevance") query.sortBy = params.sortBy;

  return query;
};

export const useInvestorFeed = (params = {}) => {
  const queryParams = buildQueryParams(params);

  return useQuery({
    queryKey: ["investor-feed", queryParams],
    queryFn: async () => {
      const res = await api.get("/api/matches/investor/feed", {
        params: queryParams,
      });
      const data = res.data;
      if (Array.isArray(data)) return data;
      return data?.matches ?? [];
    },
    keepPreviousData: true,
  });
};
