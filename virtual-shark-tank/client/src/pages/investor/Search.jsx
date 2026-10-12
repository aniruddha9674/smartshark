import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useSearchBusinesses } from "../../hooks/useSearch";
import { getErrorMessage } from "../../lib/api";

export default function Search() {
  const [input, setInput] = useState("");
  const [debounced, setDebounced] = useState("");

  // Debounce — 250ms after user stops typing
  useEffect(() => {
    const t = setTimeout(() => setDebounced(input), 250);
    return () => clearTimeout(t);
  }, [input]);

  const { data: results, isLoading, error } = useSearchBusinesses(debounced);

  const showEmptyState = debounced.trim().length < 2;
  const showNoResults =
    !showEmptyState && !isLoading && results && results.length === 0;

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-semibold mb-2">Search businesses</h1>
      <p className="text-sm text-zinc-500 mb-6">
        Fuzzy matching on name, sector, and city. Typos are okay.
      </p>

      <div className="relative mb-6">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Try 'incorbis', 'software', 'pune'..."
          className="w-full px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-100 outline-none focus:border-brand"
          autoFocus
        />
        {input && (
          <button
            onClick={() => setInput("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 text-sm"
          >
            Clear
          </button>
        )}
      </div>

      {error && (
        <div className="px-4 py-3 mb-4 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg">
          {getErrorMessage(error)}
        </div>
      )}

      {isLoading && (
        <div className="text-sm text-zinc-500">Searching...</div>
      )}

      {showEmptyState && (
        <div className="text-sm text-zinc-500">
          Type at least 2 characters to search.
        </div>
      )}

      {showNoResults && (
        <div className="text-sm text-zinc-500">
          No businesses match "{debounced}".
        </div>
      )}

      {results && results.length > 0 && (
        <>
          <div className="text-xs text-zinc-500 mb-3">
            {results.length} result{results.length === 1 ? "" : "s"}
          </div>
          <div className="grid grid-cols-2 gap-4">
            {results.map((b) => (
              <SearchResultCard key={b.id} business={b} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function SearchResultCard({ business: b }) {
  const initials = (b.company_name || "?")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const tierColors = {
    unverified: "bg-zinc-800 text-zinc-500",
    basic: "bg-blue-500/10 text-blue-400",
    verified: "bg-emerald-500/10 text-emerald-400",
  };

  return (
    <Link
      to={`/dashboard/businesses/${b.id}`}
      className="block p-5 bg-zinc-900 border border-zinc-800 rounded-xl hover:border-zinc-700 transition-colors"
    >
      <div className="flex items-start gap-4">
        {b.logo_url ? (
          <img
            src={b.logo_url}
            alt={b.company_name}
            loading="lazy"
            className="w-12 h-12 rounded-lg object-contain bg-white p-1 flex-shrink-0"
          />
        ) : (
          <div className="w-12 h-12 rounded-lg bg-zinc-800 flex items-center justify-center text-sm font-semibold flex-shrink-0">
            {initials}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-zinc-100 truncate">
              {b.company_name}
            </h3>
            {b.is_external && (
              <span className="text-xs px-1.5 py-0.5 bg-zinc-800 text-zinc-500 rounded">
                Imported
              </span>
            )}
          </div>
          <p className="text-sm text-zinc-500 mt-1">
            {b.sector || "—"} {b.city ? `· ${b.city}` : ""}
          </p>
          <div className="flex items-center justify-between mt-3">
            <span className="text-sm text-zinc-400">
              {b.funding_ask
                ? `₹${Number(b.funding_ask).toLocaleString("en-IN")}`
                : "—"}
            </span>
            <span
              className={`text-xs px-2 py-0.5 rounded ${
                tierColors[b.verification_tier] || tierColors.unverified
              }`}
            >
              {b.verification_tier}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}