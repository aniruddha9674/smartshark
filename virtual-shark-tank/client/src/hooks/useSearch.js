import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

export const useSearchBusinesses = (query) => {
  const trimmed = (query || "").trim();

  return useQuery({
    queryKey: ["search-businesses", trimmed],
    enabled: trimmed.length >= 2,
    queryFn: async () => {
      const res = await api.get("/api/search/businesses", {
        params: { q: trimmed, limit: 30 },
      });
      const data = res.data;
      if (Array.isArray(data)) return data;
      return data?.businesses ?? [];
    },
  });
};