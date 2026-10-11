import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

export const useBusinessPitches = (businessId) => {
  return useQuery({
    queryKey: ["business-pitches", businessId],
    enabled: !!businessId,
    queryFn: async () => {
      const res = await api.get("/api/pitches", {
        params: { businessId, limit: 20 },
      });
      return res.data.pitches;
    },
  });
};