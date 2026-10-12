import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

export const useBusinessPublic = (businessId) => {
  const validId =
    businessId && businessId !== "undefined" ? businessId : undefined;

  return useQuery({
    queryKey: ["business-public", validId],
    enabled: !!validId,
    queryFn: async () => {
      const res = await api.get(`/api/businesses/${validId}/public`);
      return res.data.business;
    },
  });
};