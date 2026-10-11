import { useState } from "react";
import { Link } from "react-router-dom";
import { useInvestorFeed } from "../../hooks/useInvestorFeed";
import { api, getErrorMessage } from "../../lib/api";

export default function Feed() {
  const [recomputing, setRecomputing] = useState(false);
  const { data: matches, isLoading, error, refetch } = useInvestorFeed({ limit: 20 });

  const recompute = async () => {
    setRecomputing(true);
    try {
      await api.post("/api/matches/investor/recompute");
      await refetch();
    } catch (err) {
      console.error(err);
    } finally {
      setRecomputing(false);
    }
  };

  if (isLoading) {
    return <div className="text-zinc-500">Loading feed...</div>;
  }

  if (error) {
    return (
      <div className="px-4 py-3 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg">
        {getErrorMessage(error)}
      </div>
    );
  }

  if (!matches || matches.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-zinc-500 mb-4">No matches yet.</p>
        <button
          onClick={recompute}
          disabled={recomputing}
          className="px-4 py-2 bg-brand hover:bg-brand-hover rounded-lg text-sm font-medium disabled:opacity-50"
        >
          {recomputing ? "Matching..." : "Find matches"}
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold">Your feed</h2>
        <button
          onClick={recompute}
          disabled={recomputing}
          className="px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-100 border border-zinc-800 rounded-lg disabled:opacity-50"
        >
          {recomputing ? "Recomputing..." : "Refresh matches"}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {matches.map((match) => (
          <BusinessCard key={match.id} match={match} />
        ))}
      </div>
    </div>
  );
}

function BusinessCard({ match }) {
  const b = match.business;
  const initials = (b.companyName || "?")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <Link
  to={`/dashboard/match/${match.id}`}
  className="block p-5 bg-zinc-900 border border-zinc-800 rounded-xl hover:border-zinc-700 transition-colors"
>
      <div className="flex items-start gap-4">
        {b.logoUrl ? (
          <img
            src={b.logoUrl}
            alt={b.companyName}
            loading="lazy"
            className="w-12 h-12 rounded-lg object-contain bg-white p-1 flex-shrink-0"
          />
        ) : (
          <div className="w-12 h-12 rounded-lg bg-zinc-800 flex items-center justify-center text-sm font-semibold flex-shrink-0">
            {initials}
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-zinc-100 truncate">{b.companyName}</h3>
            {b.isExternal && (
              <span className="text-xs px-1.5 py-0.5 bg-zinc-800 text-zinc-500 rounded">
                Imported
              </span>
            )}
          </div>

          <p className="text-sm text-zinc-500 mb-3">
            {b.sector || "—"} {b.city ? `· ${b.city}` : ""}
          </p>

          <div className="flex items-center justify-between text-sm">
            <span className="text-zinc-400">
              {b.fundingAsk ? `₹${Number(b.fundingAsk).toLocaleString("en-IN")}` : "—"}
            </span>
            <span className="text-brand font-medium">{match.matchScore}% match</span>
          </div>
        </div>
      </div>

      {match.matchReasons && match.matchReasons.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-4 pt-4 border-t border-zinc-800">
          {match.matchReasons
            .filter((r) => r.matched)
            .slice(0, 3)
            .map((r) => (
              <span
                key={r.factor}
                className="text-xs px-2 py-0.5 bg-brand/10 text-brand rounded"
              >
                {r.factor}
              </span>
            ))}
        </div>
      )}
    </Link>
  );
}