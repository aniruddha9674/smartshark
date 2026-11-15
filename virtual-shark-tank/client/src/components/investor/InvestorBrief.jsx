import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, getErrorMessage } from "../../lib/api";

const PROVENANCE_TAG = {
  verified: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
  self_declared: "bg-amber-500/10 text-amber-700 border-amber-500/30",
  scraped: "bg-slate-100 text-slate-500 border-slate-200",
};

export default function InvestorBrief({ businessId, verificationTier = "unverified" }) {
  const qc = useQueryClient();
  const [regenerating, setRegenerating] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["investor-brief", businessId],
    queryFn: async () => {
      const res = await api.get(`/api/businesses/${businessId}/brief`);
      return res.data;
    },
    enabled: !!businessId,
    staleTime: 5 * 60 * 1000,
  });

  const regenerate = async () => {
    setRegenerating(true);
    try {
      await api.get(`/api/businesses/${businessId}/brief?regenerate=true`);
      qc.invalidateQueries({ queryKey: ["investor-brief", businessId] });
    } finally {
      setRegenerating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 bg-white border border-slate-200 rounded-xl">
        <div className="flex items-center gap-2 text-slate-500 text-sm">
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          Generating investor brief...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-sm text-red-600">
        {getErrorMessage(error)}
      </div>
    );
  }

  if (!data?.brief) {
    return (
      <div className="p-6 bg-white border border-slate-200 rounded-xl">
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
          AI Investor Brief
        </div>
        <p className="text-sm text-slate-500">
          Not enough data yet to generate a brief. The business owner needs to add a description and sector.
        </p>
      </div>
    );
  }

  const b = data.brief;
  const tier = verificationTier === "verified" ? "verified" : "self_declared";

  const sections = [
    { key: "what_they_do", label: "What they do", icon: "◆" },
    { key: "traction", label: "Traction", icon: "▲" },
    { key: "the_ask", label: "The ask", icon: "₹" },
    { key: "risks", label: "Risks", icon: "⚠" },
  ].filter((s) => b[s.key]);

  return (
    <div className="bg-gradient-to-br from-indigo-100 via-white to-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-200 flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-xs font-semibold text-indigo-600 uppercase tracking-wider">
              AI Investor Brief
            </span>
            <span className={`text-xs px-1.5 py-0.5 rounded border ${PROVENANCE_TAG[tier]}`}>
              {tier === "verified" ? "verified sources" : "self-declared"}
            </span>
            {data.cached && (
              <span className="text-xs text-slate-400">
                cached · {new Date(b.generated_at).toLocaleDateString()}
              </span>
            )}
          </div>
          <h3 className="text-lg font-semibold text-slate-900 leading-snug">
            {b.headline}
          </h3>
        </div>
        <button
          onClick={regenerate}
          disabled={regenerating}
          className="text-xs text-slate-500 hover:text-slate-700 whitespace-nowrap disabled:opacity-50"
        >
          {regenerating ? "Regenerating..." : "Regenerate"}
        </button>
      </div>

      <div className="px-6 py-4 space-y-4">
        {sections.map((s) => (
          <div key={s.key}>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-indigo-600 text-sm">{s.icon}</span>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                {s.label}
              </span>
            </div>
            <p className="text-sm text-slate-700 leading-relaxed pl-6">
              {b[s.key]}
            </p>
          </div>
        ))}
      </div>

      {b.whats_missing && b.whats_missing.length > 0 && (
        <div className="px-6 py-4 border-t border-slate-200 bg-white">
          <div className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-2">
            Not provided by owner
          </div>
          <div className="flex flex-wrap gap-1.5">
            {b.whats_missing.map((m) => (
              <span key={m} className="text-xs px-2 py-0.5 bg-slate-100 text-slate-500 rounded">
                {m}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 text-xs text-slate-400">
        Generated from stored fields only. Not investment advice. Verify independently.
      </div>
    </div>
  );
}