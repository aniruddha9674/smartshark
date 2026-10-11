import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

export const useMyOffers = () => {
  return useQuery({
    queryKey: ["my-offers"],
    queryFn: async () => {
      const res = await api.get("/api/offers/me");
      const data = res.data;

      // Handle both shapes: array, or { offers: [...] }
      if (Array.isArray(data)) return data;
      if (data && Array.isArray(data.offers)) return data.offers;
      return [];
    },
  });
};