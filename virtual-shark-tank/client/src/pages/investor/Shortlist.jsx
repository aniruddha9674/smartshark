import { Link } from "react-router-dom";
import { useInvestorFeed } from "../../hooks/useInvestorFeed";
import { getErrorMessage } from "../../lib/api";

export default function Shortlist() {
  const { data: matches, isLoading, error } = useInvestorFeed({ limit: 100 });
  const shortlisted = (matches || []).filter((m) => m.status === "shortlisted");

  if (isLoading) return <div className="text-slate-500">Loading...</div>;
  if (error) {
    return (
      <div className="px-4 py-3 bg-red-500/10 border border-red-500/30 text-red-600 rounded-lg">
        {getErrorMessage(error)}
      </div>
    );
  }
  if (shortlisted.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-slate-500 mb-4">Nothing shortlisted yet.</p>
        <Link
          to="/dashboard/feed"
          className="btn-primary"
        >
          Browse feed
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Shortlisted</h1>
      <div className="joined-grid grid-cols-2">
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
              className="joined-cell block p-5 transition-colors hover:bg-slate-50"
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
                  <div className="w-12 h-12 rounded-lg bg-slate-100 flex items-center justify-center text-sm font-semibold flex-shrink-0">
                    {initials}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-slate-900 truncate">
                    {b.companyName}
                  </h3>
                  <p className="text-sm text-slate-500 mt-1">
                    {b.sector || "—"} {b.city ? `· ${b.city}` : ""}
                  </p>
                  <div className="text-indigo-600 font-medium text-sm mt-2">
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