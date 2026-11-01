import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

// Drizzle returns camelCase; this component uses snake_case.
// Convert every key once here so the component doesn't need to know.
function toSnakeCase(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const snake = k.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase());
    out[snake] = v;
  }
  return out;
}

export const useCompanyProfile = (businessId) => {
  return useQuery({
    queryKey: ["company-profile", businessId],
    enabled: !!businessId,
    queryFn: async () => {
      const res = await api.get(`/api/businesses/${businessId}/profile`);
      const data = res.data;
      return {
        ...data,
        business: toSnakeCase(data.business),
      };
    },
  });
};