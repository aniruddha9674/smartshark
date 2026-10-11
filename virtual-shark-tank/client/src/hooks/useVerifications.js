import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

export const useVerifications = (businessId) => {
  return useQuery({
    queryKey: ["verifications", businessId],
    enabled: !!businessId,
    queryFn: async () => {
      const res = await api.get("/api/verifications/me", {
        params: { businessId },
      });
      const data = res.data;
      if (Array.isArray(data)) return data;
      return data?.verifications ?? [];
    },
  });
};

export const useCreateVerification = (businessId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => api.post("/api/verifications", payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["verifications", businessId] });
    },
  });
};

export const useApplyVerification = (businessId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ verificationId, confirmedFields }) =>
      api.post(`/api/verifications/${verificationId}/apply`, { confirmedFields }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["verifications", businessId] });
      qc.invalidateQueries({ queryKey: ["business", businessId] });
      qc.invalidateQueries({ queryKey: ["my-businesses"] });
    },
  });
};