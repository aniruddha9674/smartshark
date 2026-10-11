import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

export const useShortlist = () => {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (matchId) => api.post(`/api/matches/${matchId}/shortlist`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["investor-feed"] });
    },
  });
};