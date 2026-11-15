import { useState, useEffect, useRef } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { api, getErrorMessage } from "../../lib/api";

const PAGE_SIZE = 20;

export default function Feed() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [matches, setMatches] = useState([]);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [recomputing, setRecomputing] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState("");

  const sentinelRef = useRef(null);
  const defaultsApplied = useRef(false);

  const sector = searchParams.get("sector") || "";
  const minAsk = searchParams.get("minAsk") || "";
  const maxAsk = searchParams.get("maxAsk") || "";
  const verifiedOnly = searchParams.get("verified") === "true";
  const sortBy = searchParams.get("sortBy") || "relevance";
  const filterKey = searchParams.toString();

  const setFilter = (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (value === "" || value == null) next.delete(key);
    else next.set(key, value);
    setSearchParams(next, { replace: true });
  };

  // ─── Fetch a page ─────────────────────────────────────────
  const fetchPage = async (currentOffset) => {
    setLoading(true);
    setError("");
    try {
      const params = { limit: PAGE_SIZE, offset: currentOffset, minScore: 0 };
      if (sector) params.sector = sector;
      if (minAsk !== "") params.minAsk = minAsk;
      if (maxAsk !== "") params.maxAsk = maxAsk;
      if (verifiedOnly) params.verifiedOnly = true;
      if (sortBy !== "relevance") params.sortBy = sortBy;

      const res = await api.get("/api/matches/investor/feed", { params });
      const page = Array.isArray(res.data) ? res.data : res.data?.matches ?? [];
      setMatches((prev) => (currentOffset === 0 ? page : [...prev, ...page]));
      setHasMore(page.length === PAGE_SIZE);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // ─── Apply saved investor preferences on first visit ──────
  useEffect(() => {
    if (defaultsApplied.current) return;
    defaultsApplied.current = true;

    const hasFilter = ["sector", "minAsk", "maxAsk", "verified", "sortBy"].some(
      (key) => searchParams.get(key)
    );
    if (hasFilter) return;

    let cancelled = false;

    (async () => {
      try {
        const res = await api.get("/api/investor/me");
        const profile = res.data?.profile;
        if (!profile || cancelled) return;

        const next = new URLSearchParams(searchParams);
        let changed = false;

        if (profile.investmentFocus) {
          next.set("sector", profile.investmentFocus);
          changed = true;
        }
        if (profile.minTicketSize != null) {
          next.set("minAsk", String(profile.minTicketSize));
          changed = true;
        }
        if (profile.maxTicketSize != null) {
          next.set("maxAsk", String(profile.maxTicketSize));
          changed = true;
        }

        if (changed) setSearchParams(next, { replace: true });
      } catch {
        // No investor preferences available — keep the unfiltered feed.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // ─── Refetch when filters change (debounced) ──────────────
  useEffect(() => {
    const t = setTimeout(() => {
      setOffset(0);
      fetchPage(0);
    }, 250);
    return () => clearTimeout(t);
  }, [filterKey]);

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
          <p className="text-sm text-slate-500 mt-1">
            Sorted by match score. Lower matches appear as you scroll.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <SearchBox />
          <button
            onClick={recompute}
            disabled={recomputing}
            className="btn-secondary btn-sm"
          >
            {recomputing ? "Recomputing..." : "Refresh"}
          </button>
        </div>
      </div>

      {/* ─── Filter bar ─────────────────────────────────────── */}
      <div className="mb-6 p-4 bg-white border border-slate-200 rounded-xl">
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500">Sector</span>
            <input
              value={sector}
              onChange={(e) => setFilter("sector", e.target.value)}
              placeholder="e.g. SaaS"
              className="w-44 px-3 py-1.5 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 outline-none focus:border-indigo-400"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500">Min ticket (₹)</span>
            <input
              type="number"
              min="0"
              value={minAsk}
              onChange={(e) => setFilter("minAsk", e.target.value)}
              placeholder="0"
              className="w-36 px-3 py-1.5 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 outline-none focus:border-indigo-400"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500">Max ticket (₹)</span>
            <input
              type="number"
              min="0"
              value={maxAsk}
              onChange={(e) => setFilter("maxAsk", e.target.value)}
              placeholder="Any"
              className="w-36 px-3 py-1.5 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 outline-none focus:border-indigo-400"
            />
          </label>

          <label className="flex items-center gap-2 pb-2 cursor-pointer">
            <input
              type="checkbox"
              checked={verifiedOnly}
              onChange={(e) =>
                setFilter("verified", e.target.checked ? "true" : "")
              }
              className="accent-brand"
            />
            <span className="text-sm text-slate-700">Verified only</span>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500">Sort by</span>
            <select
              value={sortBy}
              onChange={(e) =>
                setFilter(
                  "sortBy",
                  e.target.value === "relevance" ? "" : e.target.value
                )
              }
              className="px-3 py-1.5 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 outline-none focus:border-indigo-400"
            >
              <option value="relevance">Relevance</option>
              <option value="readiness">Readiness</option>
              <option value="newest">Newest</option>
            </select>
          </label>

          {(sector || minAsk || maxAsk || verifiedOnly || sortBy !== "relevance") && (
            <button
              onClick={() =>
                setSearchParams(new URLSearchParams(), { replace: true })
              }
              className="pb-2 text-sm text-slate-500 hover:text-slate-900"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="px-4 py-3 mb-4 bg-red-500/10 border border-red-500/30 text-red-600 rounded-lg">
          {error}
        </div>
      )}

      {matches.length === 0 && !loading && (
        <div className="text-center py-16">
          <p className="text-slate-500 mb-4">No matches yet.</p>
          <button
            onClick={recompute}
            disabled={recomputing}
            className="btn-primary"
          >
            {recomputing ? "Matching..." : "Find matches"}
          </button>
        </div>
      )}

      <div className="joined-grid grid-cols-2">
        {matches.map((match) => (
          <BusinessCard key={match.id} match={match} />
        ))}
      </div>

      {hasMore && (
        <div ref={sentinelRef} className="py-8 text-center">
          {loading && (
            <span className="text-sm text-slate-500">Loading more...</span>
          )}
        </div>
      )}

      {!hasMore && matches.length > 0 && (
        <div className="py-8 text-center text-sm text-slate-400">
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
        className="w-64 px-3 py-1.5 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 outline-none focus:border-indigo-400"
      />

      {showDropdown && (
        <div className="absolute right-0 top-full mt-2 w-96 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden z-50">
          {loading && (
            <div className="px-4 py-3 text-sm text-slate-500">Searching...</div>
          )}

          {!loading && results.length === 0 && debounced.trim().length >= 2 && (
            <div className="px-4 py-3 text-sm text-slate-500">
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
                    className={`w-full text-left px-4 py-3 flex items-center gap-3 border-b border-slate-200 last:border-0 transition-colors ${
                      activeIndex === idx ? "bg-slate-100" : "hover:bg-slate-100"
                    }`}
                  >
                    {b.logo_url ? (
                      <img
                        src={b.logo_url}
                        alt={b.company_name}
                        className="w-8 h-8 rounded object-contain bg-white p-0.5 flex-shrink-0"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded bg-slate-100 flex items-center justify-center text-xs font-semibold flex-shrink-0">
                        {initials}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-slate-900 truncate">
                        {b.company_name}
                      </div>
                      <div className="text-xs text-slate-500 truncate">
                        {b.sector || "—"} {b.city ? `· ${b.city}` : ""}
                      </div>
                    </div>
                    {b.verification_tier === "verified" && (
                      <span className="text-xs text-emerald-700 flex-shrink-0">✓</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          <div className="px-4 py-2 text-xs text-slate-400 bg-slate-50 border-t border-slate-200">
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
      ? "bg-emerald-500/10 text-emerald-700"
      : score >= 40
      ? "bg-amber-500/10 text-amber-700"
      : "bg-slate-100 text-slate-500";

  return (
    <Link
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
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-slate-900 truncate">
              {b.companyName}
            </h3>
            {b.isExternal && (
              <span className="text-xs px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded">
                Imported
              </span>
            )}
          </div>

          <p className="text-sm text-slate-500 mb-3">
            {b.sector || "—"} {b.city ? `· ${b.city}` : ""}
          </p>

          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500">
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
        <div className="flex flex-wrap gap-1.5 mt-4 pt-4 border-t border-slate-200">
          {match.matchReasons
            .filter((r) => r.matched)
            .slice(0, 3)
            .map((r) => (
              <span
                key={r.factor}
                className="text-xs px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded"
              >
                {r.factor}
              </span>
            ))}
          {match.matchReasons.every((r) => !r.matched) && (
            <span className="text-xs text-slate-400">No strong match factors</span>
          )}
        </div>
      )}
    </Link>
  );
}