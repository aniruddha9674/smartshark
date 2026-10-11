import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

export const usePortfolio = () => {
  return useQuery({
    queryKey: ["portfolio"],
    queryFn: async () => {
      const res = await api.get("/api/investments/me");
      return res.data.investments;
    },
  });
};