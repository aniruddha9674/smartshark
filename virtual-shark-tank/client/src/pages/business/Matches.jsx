import { useState } from "react";
import { useMyBusinesses } from "../../hooks/useMyBusinesses";
import { useBusinessMatches } from "../../hooks/useBusinessMatches";
import { getErrorMessage } from "../../lib/api";

export default function Matches() {
  const { data: businesses } = useMyBusinesses();
  const [selectedId, setSelectedId] = useState(null);

  const activeId = selectedId || businesses?.[0]?.id;
  const { data: matches, isLoading, error } = useBusinessMatches(activeId, { limit: 20 });

  if (!businesses || businesses.length === 0) {
    return (
      <div className="text-center py-16 text-slate-500">
        Create a business first to see matched investors.
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Matched Investors</h1>
        {businesses.length > 1 && (
          <select
            value={activeId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 text-sm"
          >
            {businesses.map((b) => (
              <option key={b.id} value={b.id}>{b.companyName}</option>
            ))}
          </select>
        )}
      </div>

      {isLoading && <div className="text-slate-500">Loading...</div>}
      {error && (
        <div className="px-4 py-3 bg-red-500/10 border border-red-500/30 text-red-600 rounded-lg">
          {getErrorMessage(error)}
        </div>
      )}

      {matches?.length === 0 && (
        <div className="text-center py-16 text-slate-500">
          No investor matches yet. Complete your profile and publish a pitch.
        </div>
      )}

      <div className="joined-grid grid-cols-2">
        {matches?.map((match) => (
          <InvestorCard key={match.id} match={match} />
        ))}
      </div>
    </div>
  );
}

function InvestorCard({ match }) {
  const inv = match.investor || {};
  const initials = (inv.firmName || inv.name || "?")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="joined-cell p-5">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-lg bg-slate-100 flex items-center justify-center text-sm font-semibold flex-shrink-0">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-slate-900 truncate">
            {inv.firmName || inv.name || "Investor"}
          </h3>
          <p className="text-sm text-slate-500 mt-1">
            {inv.investmentFocus || "—"}
          </p>
          <div className="flex items-center justify-between text-sm mt-3">
            <span className="text-slate-500">
              {inv.minTicketSize && inv.maxTicketSize
                ? `₹${Number(inv.minTicketSize).toLocaleString("en-IN")} – ₹${Number(inv.maxTicketSize).toLocaleString("en-IN")}`
                : "—"}
            </span>
            <span className="text-indigo-600 font-medium">{match.matchScore}% match</span>
          </div>
        </div>
      </div>
      {match.matchReasons?.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-4 pt-4 border-t border-slate-200">
          {match.matchReasons
            .filter((r) => r.matched)
            .slice(0, 3)
            .map((r) => (
              <span key={r.factor} className="text-xs px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded">
                {r.factor}
              </span>
            ))}
        </div>
      )}
    </div>
  );
}