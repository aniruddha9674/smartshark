import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { api, getErrorMessage } from "../../lib/api";

const PAGE_SIZE = 20;

export default function Feed() {
  const queryClient = useQueryClient();
  const [matches, setMatches] = useState([]);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [recomputing, setRecomputing] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState("");

  const sentinelRef = useRef(null);

  // ─── Fetch a page ─────────────────────────────────────────
  const fetchPage = async (currentOffset) => {
    setLoading(true);
    setError("");
    try {
      const res = await api.get("/api/matches/investor/feed", {
        params: { limit: PAGE_SIZE, offset: currentOffset, minScore: 0 },
      });
      const page = Array.isArray(res.data) ? res.data : res.data?.matches ?? [];
      setMatches((prev) => (currentOffset === 0 ? page : [...prev, ...page]));
      setHasMore(page.length === PAGE_SIZE);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPage(0);
    setOffset(0);
  }, []);

  // ─── Infinite scroll ──────────────────────────────────────
  useEffect(() => {
    if (!sentinelRef.current || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loading && hasMore) {
          const next = offset + PAGE_SIZE;
          setOffset(next);
          fetchPage(next);
        }
      },
      { rootMargin: "400px" }
    );

    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [offset, loading, hasMore]);

  const recompute = async () => {
    setRecomputing(true);
    setError("");
    try {
      await api.post("/api/matches/investor/recompute");
      queryClient.invalidateQueries({ queryKey: ["investor-feed"] });
      setMatches([]);
      setOffset(0);
      setHasMore(true);
      await fetchPage(0);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setRecomputing(false);
    }
  };

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-semibold">Your feed</h2>
          <p className="text-sm text-zinc-500 mt-1">
            Sorted by match score. Lower matches appear as you scroll.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <SearchBox />
          <button
            onClick={recompute}
            disabled={recomputing}
            className="px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-100 border border-zinc-800 rounded-lg disabled:opacity-50"
          >
            {recomputing ? "Recomputing..." : "Refresh"}
          </button>
        </div>
      </div>

      {error && (
        <div className="px-4 py-3 mb-4 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg">
          {error}
        </div>
      )}

      {matches.length === 0 && !loading && (
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
      )}

      <div className="grid grid-cols-2 gap-4">
        {matches.map((match) => (
          <BusinessCard key={match.id} match={match} />
        ))}
      </div>

      {hasMore && (
        <div ref={sentinelRef} className="py-8 text-center">
          {loading && (
            <span className="text-sm text-zinc-500">Loading more...</span>
          )}
        </div>
      )}

      {!hasMore && matches.length > 0 && (
        <div className="py-8 text-center text-sm text-zinc-600">
          You've reached the end of the feed.
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SEARCH BOX — dropdown overlay
// ═══════════════════════════════════════════════════════════════

function SearchBox() {
  const navigate = useNavigate();
  const [input, setInput] = useState("");
  const [debounced, setDebounced] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const wrapperRef = useRef(null);
  const inputRef = useRef(null);

  // Debounce input
  useEffect(() => {
    const t = setTimeout(() => setDebounced(input), 200);
    return () => clearTimeout(t);
  }, [input]);

  // Fetch results when debounced changes
  useEffect(() => {
    if (debounced.trim().length < 2) {
      setResults([]);
      return;
    }

    let cancelled = false;
    setLoading(true);

    api
      .get("/api/search/businesses", { params: { q: debounced, limit: 10 } })
      .then((res) => {
        if (cancelled) return;
        const data = res.data;
        const list = Array.isArray(data) ? data : data?.businesses ?? [];
        setResults(list);
        setActiveIndex(-1);
      })
      .catch(() => {
        if (!cancelled) setResults([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debounced]);

  // Click outside to close
  useEffect(() => {
    const onClick = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);
const goTo = (arg) => {
  // Accept either { id, match_id, ... } object or a plain id string
  const business = typeof arg === "string" ? { id: arg } : arg;

  if (!business?.id || business.id === "undefined") {
    console.error("[SearchBox] goTo called without a valid business id:", arg);
    return;
  }

  setOpen(false);
  setInput("");
  setDebounced("");
  setResults([]);

  if (business.match_id) {
    navigate(`/dashboard/match/${business.match_id}`);
  } else {
    navigate(`/dashboard/browse/${business.id}`);
  }
};

  const onKeyDown = (e) => {
    if (!open || results.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === "Enter" && activeIndex >= 0) {
  e.preventDefault();
  goTo(results[activeIndex]);   // whole object, not .id
} else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const showDropdown = open && input.trim().length >= 2;

  return (
    <div ref={wrapperRef} className="relative">
      <input
        ref={inputRef}
        value={input}
        onChange={(e) => {
          setInput(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Search businesses..."
        className="w-64 px-3 py-1.5 text-sm bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 outline-none focus:border-brand"
      />

      {showDropdown && (
        <div className="absolute right-0 top-full mt-2 w-96 bg-zinc-900 border border-zinc-800 rounded-xl shadow-lg overflow-hidden z-50">
          {loading && (
            <div className="px-4 py-3 text-sm text-zinc-500">Searching...</div>
          )}

          {!loading && results.length === 0 && debounced.trim().length >= 2 && (
            <div className="px-4 py-3 text-sm text-zinc-500">
              No businesses match "{debounced}".
            </div>
          )}

          {!loading && results.length > 0 && (
            <div className="max-h-96 overflow-y-auto">
              {results.map((b, idx) => {
                const initials = (b.company_name || "?")
                  .split(" ")
                  .map((w) => w[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase();

                return (
                  <button
                    key={b.id}
                    onMouseEnter={() => setActiveIndex(idx)}
                   onClick={() => goTo(b)}
                    className={`w-full text-left px-4 py-3 flex items-center gap-3 border-b border-zinc-800 last:border-0 transition-colors ${
                      activeIndex === idx ? "bg-zinc-800" : "hover:bg-zinc-800"
                    }`}
                  >
                    {b.logo_url ? (
                      <img
                        src={b.logo_url}
                        alt={b.company_name}
                        className="w-8 h-8 rounded object-contain bg-white p-0.5 flex-shrink-0"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded bg-zinc-800 flex items-center justify-center text-xs font-semibold flex-shrink-0">
                        {initials}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-zinc-100 truncate">
                        {b.company_name}
                      </div>
                      <div className="text-xs text-zinc-500 truncate">
                        {b.sector || "—"} {b.city ? `· ${b.city}` : ""}
                      </div>
                    </div>
                    {b.verification_tier === "verified" && (
                      <span className="text-xs text-emerald-400 flex-shrink-0">✓</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          <div className="px-4 py-2 text-xs text-zinc-600 bg-zinc-950 border-t border-zinc-800">
            ↑↓ to navigate · Enter to open · Esc to close
          </div>
        </div>
      )}
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

  const score = match.matchScore ?? 0;
  const scoreColor =
    score >= 70
      ? "bg-emerald-500/10 text-emerald-400"
      : score >= 40
      ? "bg-amber-500/10 text-amber-400"
      : "bg-zinc-800 text-zinc-500";

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
            <h3 className="font-semibold text-zinc-100 truncate">
              {b.companyName}
            </h3>
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
              {b.fundingAsk
                ? `₹${Number(b.fundingAsk).toLocaleString("en-IN")}`
                : "—"}
            </span>
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${scoreColor}`}>
              {score}% match
            </span>
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
          {match.matchReasons.every((r) => !r.matched) && (
            <span className="text-xs text-zinc-600">No strong match factors</span>
          )}
        </div>
      )}
    </Link>
  );
}