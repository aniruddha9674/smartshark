import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

export const useReceivedOffers = (businessId) => {
  return useQuery({
    queryKey: ["received-offers", businessId],
    enabled: !!businessId,
    queryFn: async () => {
      const res = await api.get("/api/offers/received", {
        params: { businessId },
      });
      const data = res.data;
      if (Array.isArray(data)) return data;
      return data?.offers ?? [];
    },
  });
};

export const useAcceptOffer = (businessId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (offerId) => api.post(`/api/offers/${offerId}/accept`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["received-offers", businessId] });
      qc.invalidateQueries({ queryKey: ["my-businesses"] });
    },
  });
};

export const useRejectOffer = (businessId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (offerId) => api.post(`/api/offers/${offerId}/reject`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["received-offers", businessId] });
    },
  });
};

export const useCounterOffer = (businessId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ offerId, amount, equityRequested, message }) =>
      api.post(`/api/offers/${offerId}/counter`, {
        amount,
        equityRequested,
        message,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["received-offers", businessId] });
    },
  });
};