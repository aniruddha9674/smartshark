import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

export const useMyBusinesses = () => {
  return useQuery({
    queryKey: ["my-businesses"],
    queryFn: async () => {
      const res = await api.get("/api/businesses");
      const data = res.data;
      if (Array.isArray(data)) return data;
      return data?.businesses ?? [];
    },
  });
};

export const useBusiness = (businessId) => {
  return useQuery({
    queryKey: ["business", businessId],
    enabled: !!businessId,
    queryFn: async () => {
      const res = await api.get(`/api/businesses/${businessId}`);
      return res.data.business;
    },
  });
};