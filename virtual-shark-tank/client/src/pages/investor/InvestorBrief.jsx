import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, getErrorMessage } from "../../lib/api";

const PROVENANCE_TAG = {
  verified: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  self_declared: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  scraped: "bg-zinc-800 text-zinc-400 border-zinc-700",
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
      <div className="p-6 bg-zinc-900 border border-zinc-800 rounded-xl">
        <div className="flex items-center gap-2 text-zinc-500 text-sm">
          <span className="w-2 h-2 rounded-full bg-brand animate-pulse" />
          Generating investor brief...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-sm text-red-400">
        {getErrorMessage(error)}
      </div>
    );
  }

  if (!data?.brief) {
    return (
      <div className="p-6 bg-zinc-900 border border-zinc-800 rounded-xl">
        <p className="text-sm text-zinc-500">
          Not enough data yet to generate a brief. The owner needs to add a description and sector.
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
    <div className="bg-gradient-to-br from-zinc-900 to-zinc-950 border border-zinc-800 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-zinc-800 flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold text-brand uppercase tracking-wider">
              AI Investor Brief
            </span>
            <span className={`text-xs px-1.5 py-0.5 rounded border ${PROVENANCE_TAG[tier]}`}>
              {tier === "verified" ? "verified sources" : "self-declared"}
            </span>
            {data.cached && (
              <span className="text-xs text-zinc-600">
                cached · {new Date(b.generated_at).toLocaleDateString()}
              </span>
            )}
          </div>
          <h3 className="text-lg font-semibold text-zinc-100 leading-snug">
            {b.headline}
          </h3>
        </div>
        <button
          onClick={regenerate}
          disabled={regenerating}
          className="text-xs text-zinc-500 hover:text-zinc-300 whitespace-nowrap"
        >
          {regenerating ? "Regenerating..." : "Regenerate"}
        </button>
      </div>

      {/* Sections */}
      <div className="px-6 py-4 space-y-4">
        {sections.map((s) => (
          <div key={s.key}>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-brand text-sm">{s.icon}</span>
              <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                {s.label}
              </span>
            </div>
            <p className="text-sm text-zinc-300 leading-relaxed pl-6">
              {b[s.key]}
            </p>
          </div>
        ))}
      </div>

      {/* Missing fields */}
      {b.whats_missing && b.whats_missing.length > 0 && (
        <div className="px-6 py-4 border-t border-zinc-800 bg-zinc-950/50">
          <div className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-2">
            Not provided by owner
          </div>
          <div className="flex flex-wrap gap-1.5">
            {b.whats_missing.map((m) => (
              <span key={m} className="text-xs px-2 py-0.5 bg-zinc-800 text-zinc-400 rounded">
                {m}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Disclaimer */}
      <div className="px-6 py-3 border-t border-zinc-800 bg-zinc-950 text-xs text-zinc-600">
        Generated from stored fields only. Not investment advice. Verify independently.
      </div>
    </div>
  );
}