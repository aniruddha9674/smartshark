import { Link } from "react-router-dom";
import { useInvestorFeed } from "../../hooks/useInvestorFeed";
import { getErrorMessage } from "../../lib/api";

export default function Shortlist() {
  const { data: matches, isLoading, error } = useInvestorFeed({ limit: 100 });
  const shortlisted = (matches || []).filter((m) => m.status === "shortlisted");

  if (isLoading) return <div className="text-zinc-500">Loading...</div>;
  if (error) {
    return (
      <div className="px-4 py-3 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg">
        {getErrorMessage(error)}
      </div>
    );
  }
  if (shortlisted.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-zinc-500 mb-4">Nothing shortlisted yet.</p>
        <Link
          to="/dashboard/feed"
          className="inline-block px-4 py-2 bg-brand hover:bg-brand-hover rounded-lg text-sm font-medium"
        >
          Browse feed
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Shortlisted</h1>
      <div className="grid grid-cols-2 gap-4">
        {shortlisted.map((match) => {
          const b = match.business;
          const initials = (b.companyName || "?")
            .split(" ")
            .map((w) => w[0])
            .join("")
            .slice(0, 2)
            .toUpperCase();

          return (
            <Link
              key={match.id}
              to={`/dashboard/match/${match.id}`}
              className="p-5 bg-zinc-900 border border-zinc-800 rounded-xl hover:border-zinc-700 transition-colors"
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
                  <h3 className="font-semibold text-zinc-100 truncate">
                    {b.companyName}
                  </h3>
                  <p className="text-sm text-zinc-500 mt-1">
                    {b.sector || "—"} {b.city ? `· ${b.city}` : ""}
                  </p>
                  <div className="text-brand font-medium text-sm mt-2">
                    {match.matchScore}% match
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}