import { Link } from "react-router-dom";
import { useMyBusinesses } from "../../hooks/useMyBusinesses";
import { getErrorMessage } from "../../lib/api";

const tierColors = {
  unverified: "bg-zinc-800 text-zinc-500",
  basic: "bg-blue-500/10 text-blue-400",
  verified: "bg-emerald-500/10 text-emerald-400",
};

const tierSymbol = {
  unverified: "○",
  basic: "◐",
  verified: "✓",
};

export default function MyBusinesses() {
  const { data: businesses, isLoading, error } = useMyBusinesses();

  if (isLoading) return <div className="text-zinc-500">Loading...</div>;
  if (error) {
    return (
      <div className="px-4 py-3 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg">
        {getErrorMessage(error)}
      </div>
    );
  }

  if (!businesses || businesses.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-zinc-500 mb-4">You haven't created a business yet.</p>
        <Link
          to="/onboarding/business"
          className="inline-block px-4 py-2 bg-brand hover:bg-brand-hover rounded-lg text-sm font-medium"
        >
          Create a business
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">My Businesses</h1>
        <Link
          to="/onboarding/business"
          className="px-3 py-1.5 text-sm bg-brand hover:bg-brand-hover rounded-lg font-medium"
        >
          + Add Business
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {businesses.map((b) => {
          const initials = (b.companyName || "?")
            .split(" ")
            .map((w) => w[0])
            .join("")
            .slice(0, 2)
            .toUpperCase();

          const tier = b.verificationTier || "unverified";

          return (
            <Link
              key={b.id}
              to={`/dashboard/businesses/${b.id}`}
              className="p-5 bg-zinc-900 border border-zinc-800 rounded-xl hover:border-zinc-700 transition-colors"
            >
              <div className="flex items-start gap-4">
                {b.logoUrl ? (
                  <img
                    src={b.logoUrl}
                    alt={b.companyName}
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
                  <span
                    className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded mt-3 font-medium ${
                      tierColors[tier] || tierColors.unverified
                    }`}
                  >
                    <span>{tierSymbol[tier]}</span>
                    {tier}
                  </span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}