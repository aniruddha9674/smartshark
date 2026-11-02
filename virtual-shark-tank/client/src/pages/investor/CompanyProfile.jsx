import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useMatch } from "../../hooks/useMatch";
import { useCompanyProfile } from "../../hooks/useCompanyProfile";
import { useBusinessPitches } from "../../hooks/useBusinessPitches";
import { api, getErrorMessage } from "../../lib/api";
import MakeOfferModal from "../../components/MakeOfferModal";
import InvestorBrief from "../../components/investor/InvestorBrief";

const SECTOR_GRADIENT = {
  Manufacturing: "from-blue-900/50 via-blue-800/30 to-zinc-900",
  "Business Services": "from-purple-900/50 via-purple-800/30 to-zinc-900",
  "Social Services": "from-pink-900/50 via-pink-800/30 to-zinc-900",
  Trading: "from-emerald-900/50 via-emerald-800/30 to-zinc-900",
  Construction: "from-amber-900/50 via-amber-800/30 to-zinc-900",
  "Real Estate": "from-cyan-900/50 via-cyan-800/30 to-zinc-900",
  "Transport & Logistics": "from-orange-900/50 via-orange-800/30 to-zinc-900",
  Healthcare: "from-rose-900/50 via-rose-800/30 to-zinc-900",
  Agritech: "from-lime-900/50 via-lime-800/30 to-zinc-900",
  agritech: "from-lime-900/50 via-lime-800/30 to-zinc-900",
};

const TIER_STYLE = {
  verified: { dot: "bg-emerald-400", label: "Verified", bg: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" },
  document_backed: { dot: "bg-blue-400", label: "Document", bg: "bg-blue-500/10 text-blue-400 border-blue-500/30" },
  self_declared: { dot: "bg-amber-400", label: "Self-declared", bg: "bg-amber-500/10 text-amber-400 border-amber-500/30" },
  generated: { dot: "bg-zinc-500", label: "Auto-generated", bg: "bg-zinc-800 text-zinc-400 border-zinc-700" },
  scraped: { dot: "bg-zinc-500", label: "Scraped", bg: "bg-zinc-800 text-zinc-400 border-zinc-700" },
};

function ProvenanceBadge({ tier }) {
  if (!tier) return null;
  const s = TIER_STYLE[tier] || TIER_STYLE.scraped;
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded border ${s.bg}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

function formatINR(n) {
  const num = Number(n);
  if (!Number.isFinite(num) || num === 0) return "—";
  if (num >= 1_00_00_000) return `₹${(num / 1_00_00_000).toFixed(1)} Cr`;
  if (num >= 1_00_000) return `₹${(num / 1_00_000).toFixed(1)} L`;
  if (num >= 1_000) return `₹${(num / 1_000).toFixed(0)}K`;
  return `₹${num}`;
}

function Section({ title, provenance, children }) {
  return (
    <section className="mb-6">
      <div className="flex items-center gap-3 mb-3">
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">{title}</h2>
        {provenance && <ProvenanceBadge tier={provenance.tier} />}
      </div>
      <div className="p-5 bg-zinc-900 border border-zinc-800 rounded-xl">{children}</div>
    </section>
  );
}

export default function BusinessDetail() {
  const { matchId, businessId: paramBusinessId } = useParams();
  const isMatchView = !!matchId;
  const navigate = useNavigate();

  const matchQuery = useMatch(isMatchView ? matchId : undefined);
  const match = matchQuery.data;

  const derivedBusinessId = isMatchView ? match?.businessId : paramBusinessId;
  const profileQuery = useCompanyProfile(derivedBusinessId);
  const profileData = profileQuery.data;

  const { data: pitches, isLoading: pitchesLoading } = useBusinessPitches(derivedBusinessId);

  const [offerPitch, setOfferPitch] = useState(null);
  const [actionError, setActionError] = useState("");

  const isLoading = profileQuery.isLoading || (isMatchView && matchQuery.isLoading);
  const error = profileQuery.error || (isMatchView && matchQuery.error);

  const shortlist = async () => {
    try {
      await api.post(`/api/matches/${matchId}/shortlist`);
      matchQuery.refetch();
    } catch (err) {
      setActionError(getErrorMessage(err));
    }
  };

  const pass = async () => {
    try {
      await api.post(`/api/matches/${matchId}/pass`);
      navigate("/dashboard/feed");
    } catch (err) {
      setActionError(getErrorMessage(err));
    }
  };

  if (isLoading) return <div className="text-zinc-500 p-8">Loading profile...</div>;
  if (error) return <div className="p-8 text-red-400">{getErrorMessage(error)}</div>;
  if (!profileData?.business) return <div className="p-8 text-zinc-500">Not found</div>;

  const { business: b, provenance: p, media, directors } = profileData;
  const initials = (b.company_name || "?").replace(/[^\w\s]/g, "").split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const gradient = SECTOR_GRADIENT[b.sector] || "from-zinc-800 via-zinc-900 to-zinc-950";
  const foundedYear = b.incorporation_date ? new Date(b.incorporation_date).getFullYear() : null;
  const completeness = b.profile_completeness_pct || 0;

  const businessForModal = {
    id: b.id,
    companyName: b.company_name,
    sector: b.sector,
    city: b.city,
    logoUrl: b.logo_url,
  };

  return (
    <div className="max-w-4xl mx-auto">
      <Link to="/dashboard/feed" className="text-sm text-zinc-500 hover:text-zinc-300 mb-4 inline-block">
        ← Back to feed
      </Link>

      {/* HERO */}
      <div className={`relative rounded-2xl overflow-hidden mb-6 bg-gradient-to-br ${gradient}`}>
        <div className="h-40" />
        <div className="px-6 pb-6 -mt-12 flex items-end gap-5">
          <div className="w-24 h-24 rounded-2xl bg-zinc-900 border-4 border-zinc-950 flex items-center justify-center text-3xl font-bold text-zinc-300 flex-shrink-0 overflow-hidden">
            {b.logo_url ? (
              <img
                src={b.logo_url}
                alt={b.company_name}
                className="w-full h-full object-contain bg-white p-1.5"
                onError={(e) => {
                  e.target.style.display = "none";
                  e.target.parentElement.innerHTML = `<span class="text-3xl font-bold text-zinc-300">${initials}</span>`;
                }}
              />
            ) : (
              initials
            )}
          </div>
          <div className="flex-1 pb-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-semibold text-zinc-100">{b.company_name}</h1>
              {b.data_source === "mca" && (
                <span className="text-xs px-2 py-0.5 bg-blue-500/20 text-blue-300 rounded-full border border-blue-500/30">
                  MCA Registered
                </span>
              )}
              {b.verification_tier === "verified" && (
                <span className="text-xs px-2 py-0.5 bg-emerald-500/20 text-emerald-300 rounded-full border border-emerald-500/30">
                  ✓ Platform Verified
                </span>
              )}
              {b.company_status && (
                <span className={`text-xs px-2 py-0.5 rounded-full border ${b.company_status === "Active" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" : "bg-zinc-800 text-zinc-400 border-zinc-700"}`}>
                  {b.company_status}
                </span>
              )}
              {match && (
                <span className="text-xs px-2 py-0.5 bg-brand/20 text-brand rounded-full border border-brand/40 font-medium">
                  {match.matchScore}% match
                </span>
              )}
            </div>
            {b.tagline && <p className="text-zinc-300 mt-1">{b.tagline}</p>}
            <p className="text-sm text-zinc-400 mt-1">
              {b.sector || "—"} · {b.city || "—"}
              {foundedYear && ` · Founded ${foundedYear}`}
            </p>
          </div>
        </div>
      </div>

      {/* MATCH ACTIONS (only in match view) */}
      {isMatchView && match && (
        <div className="mb-6 p-4 bg-zinc-900 border border-zinc-800 rounded-xl">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-sm text-zinc-400">Match actions</span>
          </div>
          {actionError && (
            <div className="px-3 py-2 mb-3 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg text-sm">
              {actionError}
            </div>
          )}
          <div className="flex gap-2">
            <button
              onClick={shortlist}
              disabled={match.status === "shortlisted"}
              className="px-4 py-2 bg-brand hover:bg-brand-hover rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {match.status === "shortlisted" ? "Shortlisted ✓" : "Shortlist"}
            </button>
            <button
              onClick={pass}
              className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-100 border border-zinc-800 rounded-lg"
            >
              Pass
            </button>
          </div>

          {match.matchReasons && match.matchReasons.length > 0 && (
            <div className="mt-4 pt-4 border-t border-zinc-800">
              <div className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Why this matched</div>
              <div className="space-y-2">
                {match.matchReasons.map((r) => (
                  <div key={r.factor} className="flex items-start gap-3 text-sm">
                    <span className={`w-5 h-5 flex items-center justify-center rounded flex-shrink-0 ${r.matched ? "bg-emerald-500/20 text-emerald-400" : "bg-zinc-800 text-zinc-500"}`}>
                      {r.matched ? "✓" : "·"}
                    </span>
                    <div>
                      <div className="text-zinc-200 capitalize">{r.factor}</div>
                      <div className="text-zinc-500 text-xs mt-0.5">{r.detail}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* COMPLETENESS */}
      <div className="mb-6 p-4 bg-zinc-900 border border-zinc-800 rounded-xl">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-zinc-400">Profile completeness</span>
          <span className="text-sm font-semibold text-zinc-200">{completeness}%</span>
        </div>
        <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400"
            style={{ width: `${completeness}%` }}
          />
        </div>
      </div>

      {/* AI INVESTOR BRIEF */}
      <div className="mb-6">
        <InvestorBrief
          businessId={b.id}
          verificationTier={b.verification_tier}
        />
      </div>

      {/* ACTIVE PITCH */}
      <section className="mb-6">
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">
          Active Pitch
        </h2>
        {pitchesLoading ? (
          <div className="text-zinc-500 text-sm">Loading...</div>
        ) : !pitches || pitches.length === 0 ? (
          <div className="p-5 bg-zinc-900 border border-zinc-800 rounded-xl text-sm text-zinc-500">
            This business isn't currently raising.
          </div>
        ) : (
          <div className="space-y-3">
            {pitches.map((pitch) => (
              <div key={pitch.id} className="p-6 bg-gradient-to-br from-brand/10 to-zinc-900 border border-brand/30 rounded-xl">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-zinc-100">{pitch.title}</h3>
                    {pitch.tagline && (
                      <p className="text-sm text-zinc-400 mt-1">{pitch.tagline}</p>
                    )}
                  </div>
                  <span className="text-xs px-2 py-1 bg-emerald-500/20 text-emerald-300 rounded-full border border-emerald-500/30 whitespace-nowrap">
                    Live
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-4 mb-4 py-3 border-y border-zinc-800">
                  <div>
                    <div className="text-xs text-zinc-500 mb-0.5">Raising</div>
                    <div className="text-lg font-semibold text-zinc-100">
                      {formatINR(pitch.askAmount)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-500 mb-0.5">For</div>
                    <div className="text-lg font-semibold text-zinc-100">
                      {pitch.equityOffered}%
                    </div>
                  </div>
                  {pitch.valuation && (
                    <div>
                      <div className="text-xs text-zinc-500 mb-0.5">Valuation</div>
                      <div className="text-lg font-semibold text-zinc-100">
                        {formatINR(pitch.valuation)}
                      </div>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => setOfferPitch(pitch)}
                  className="w-full px-4 py-3 bg-brand hover:bg-brand-hover text-black rounded-lg font-semibold transition-colors"
                >
                  Make an offer →
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* READINESS */}
      {b.current_readiness_score != null && (
        <Section title="Readiness Score" provenance={{ tier: "verified" }}>
          <div className="flex items-baseline gap-3">
            <span className="text-4xl font-bold text-zinc-100">{b.current_readiness_score}</span>
            <span className="text-zinc-500">/ 100</span>
          </div>
        </Section>
      )}

      {/* FUNDING ASK */}
      {(b.funding_ask || b.funding_instrument) && (
        <Section title="Funding Ask" provenance={p.funding_ask}>
          <div className="flex items-baseline gap-3 mb-4">
            <span className="text-2xl font-semibold text-zinc-100">{formatINR(b.funding_ask)}</span>
            {b.funding_instrument && (
              <span className="text-sm text-zinc-400">· {b.funding_instrument.replace("_", " ")}</span>
            )}
          </div>
          {Array.isArray(b.use_of_funds) && b.use_of_funds.length > 0 && (
            <div className="space-y-2 mb-4">
              {b.use_of_funds.map((u, i) => (
                <div key={i} className="flex items-center gap-3 text-sm">
                  <span className="w-12 text-right text-zinc-400">{u.pct}%</span>
                  <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                    <div className="h-full bg-brand" style={{ width: `${u.pct}%` }} />
                  </div>
                  <span className="flex-1 text-zinc-300">{u.category}</span>
                </div>
              ))}
            </div>
          )}
          {Array.isArray(b.planned_milestones) && b.planned_milestones.length > 0 && (
            <div className="pt-3 border-t border-zinc-800 space-y-1.5">
              {b.planned_milestones.map((m, i) => (
                <div key={i} className="text-sm text-zinc-400">
                  <span className="text-zinc-500">Month {m.months}:</span> {m.milestone}
                </div>
              ))}
            </div>
          )}
        </Section>
      )}

      {/* TRACTION */}
      {(b.revenue_range || b.customer_count) && (
        <Section title="Traction" provenance={p.revenue_range}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {b.revenue_range && (
              <div>
                <div className="text-xs text-zinc-500">Revenue</div>
                <div className="text-lg font-semibold text-zinc-100 mt-1">{b.revenue_range}</div>
                {b.revenue_trend_bracket && (
                  <div className="text-xs text-emerald-400 mt-0.5">
                    {b.revenue_trend_bracket.replace("growing_", "Growing ")}%
                  </div>
                )}
              </div>
            )}
            {b.customer_count && (
              <div>
                <div className="text-xs text-zinc-500">Customers</div>
                <div className="text-lg font-semibold text-zinc-100 mt-1">{b.customer_count.toLocaleString("en-IN")}</div>
              </div>
            )}
            {b.repeat_customer_pct && (
              <div>
                <div className="text-xs text-zinc-500">Repeat Rate</div>
                <div className="text-lg font-semibold text-zinc-100 mt-1">{b.repeat_customer_pct}%</div>
              </div>
            )}
            {b.monthly_order_volume && (
              <div>
                <div className="text-xs text-zinc-500">Monthly Orders</div>
                <div className="text-lg font-semibold text-zinc-100 mt-1">{b.monthly_order_volume.toLocaleString("en-IN")}</div>
              </div>
            )}
          </div>
        </Section>
      )}

      {/* ABOUT */}
      {b.description && (
        <Section title="About" provenance={p.description}>
          <p className="text-zinc-300 whitespace-pre-wrap mb-4">{b.description}</p>
          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-zinc-800 text-sm">
            {b.business_model && <div><div className="text-zinc-500">Business model</div><div className="text-zinc-200 mt-1">{b.business_model}</div></div>}
            {b.target_market && <div><div className="text-zinc-500">Target market</div><div className="text-zinc-200 mt-1">{b.target_market}</div></div>}
          </div>
          {b.differentiation && (
            <div className="mt-4 pt-4 border-t border-zinc-800">
              <div className="text-zinc-500 text-sm mb-1">Differentiation</div>
              <div className="text-zinc-300 text-sm">{b.differentiation}</div>
            </div>
          )}
        </Section>
      )}

      {/* MEDIA */}
      {media && media.length > 0 && (
        <Section title="Media">
          <div className="grid grid-cols-3 gap-2">
            {media.map((m) => (
              <img key={m.id} src={m.url} alt={m.caption || ""} className="rounded-lg aspect-video object-cover" />
            ))}
          </div>
        </Section>
      )}

      {/* LEGAL */}
      <Section title="Legal & Registry (MCA)" provenance={p.cin || { tier: "verified" }}>
        <div className="grid grid-cols-2 gap-4 text-sm">
          {b.cin && <div><div className="text-zinc-500">CIN</div><div className="text-zinc-200 mt-1 font-mono text-xs">{b.cin}</div></div>}
          {b.company_roc && <div><div className="text-zinc-500">ROC</div><div className="text-zinc-200 mt-1">{b.company_roc}</div></div>}
          {b.company_class && <div><div className="text-zinc-500">Class</div><div className="text-zinc-200 mt-1">{b.company_class}</div></div>}
          {b.company_category && <div><div className="text-zinc-500">Category</div><div className="text-zinc-200 mt-1">{b.company_category}</div></div>}
          {b.authorized_capital && <div><div className="text-zinc-500">Authorized capital</div><div className="text-zinc-200 mt-1">{formatINR(b.authorized_capital)}</div></div>}
          {b.paid_up_capital && <div><div className="text-zinc-500">Paid-up capital</div><div className="text-zinc-200 mt-1">{formatINR(b.paid_up_capital)}</div></div>}
          {b.incorporation_date && <div><div className="text-zinc-500">Incorporated</div><div className="text-zinc-200 mt-1">{String(b.incorporation_date).slice(0, 10)}</div></div>}
          {b.registered_address && <div className="col-span-2"><div className="text-zinc-500">Registered address</div><div className="text-zinc-200 mt-1 text-xs">{b.registered_address}</div></div>}
        </div>
      </Section>

      {/* TEAM */}
      {(b.employee_count || (directors && directors.length > 0)) && (
        <Section title="Team" provenance={p.employee_count}>
          {b.employee_count && (
            <div className="text-sm mb-4">
              <span className="text-zinc-500">Employees: </span>
              <span className="text-zinc-200 font-medium">{b.employee_count}</span>
            </div>
          )}
          {directors && directors.length > 0 && (
            <div className="space-y-2">
              {directors.map((d) => (
                <div key={d.id} className="flex items-center justify-between text-sm">
                  <span className="text-zinc-200">{d.name}</span>
                  <span className="text-zinc-500 font-mono text-xs">DIN {d.din}</span>
                </div>
              ))}
            </div>
          )}
        </Section>
      )}

      {/* RISKS */}
      {b.self_declared_risks && (
        <Section title="Risks & Disclosures" provenance={p.self_declared_risks}>
          <p className="text-zinc-300 text-sm whitespace-pre-wrap">{b.self_declared_risks}</p>
          {b.litigation_notes && (
            <div className="mt-3 pt-3 border-t border-zinc-800 text-sm">
              <span className="text-zinc-500">Litigation: </span>
              <span className="text-zinc-300">{b.litigation_notes}</span>
            </div>
          )}
        </Section>
      )}

      {/* PROVENANCE LEGEND */}
      <div className="mt-8 p-4 bg-zinc-900/50 border border-zinc-800 rounded-xl text-xs text-zinc-500">
        <div className="font-semibold text-zinc-400 mb-2">What the badges mean</div>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> <span className="text-emerald-400">Verified</span> — Confirmed by a government registry</div>
          <div className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-blue-400" /> <span className="text-blue-400">Document</span> — Extracted from an uploaded document</div>
          <div className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> <span className="text-amber-400">Self-declared</span> — Entered by the owner, not verified</div>
          <div className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-zinc-500" /> <span className="text-zinc-400">Auto-generated</span> — Built from registry data</div>
          <div className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-zinc-500" /> <span className="text-zinc-400">Scraped</span> — Retrieved from the public web</div>
        </div>
      </div>

      {offerPitch && (
        <MakeOfferModal
          pitch={offerPitch}
          business={businessForModal}
          onClose={() => setOfferPitch(null)}
          onSuccess={() => {
            alert("Offer sent");
            setOfferPitch(null);
          }}
        />
      )}
    </div>
  );
}