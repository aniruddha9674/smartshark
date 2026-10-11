import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useMatch } from "../../hooks/useMatch";
import { useBusinessPitches } from "../../hooks/useBusinessPitches";
import { api, getErrorMessage } from "../../lib/api";
import MakeOfferModal from "../../components/MakeOfferModal";

export default function BusinessDetail() {
  const { matchId } = useParams();
  const navigate = useNavigate();
  const [offerPitch, setOfferPitch] = useState(null);
  const [actionError, setActionError] = useState("");

  const { data: match, isLoading, error, refetch } = useMatch(matchId);
  const businessId = match?.businessId;
  const { data: pitches, isLoading: pitchesLoading } = useBusinessPitches(businessId);

  const shortlist = async () => {
    try {
      await api.post(`/api/matches/${matchId}/shortlist`);
      refetch();
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

  if (isLoading) return <div className="text-zinc-500">Loading...</div>;
  if (error) {
    return (
      <div className="px-4 py-3 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg">
        {getErrorMessage(error)}
      </div>
    );
  }
  if (!match) return <div className="text-zinc-500">Not found</div>;

  const b = match.business;
  const initials = (b.companyName || "?")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="max-w-3xl">
      <Link
        to="/dashboard/feed"
        className="text-sm text-zinc-500 hover:text-zinc-300 mb-4 inline-block"
      >
        ← Back to feed
      </Link>

      <div className="flex items-start gap-4 mb-6">
        {b.logoUrl ? (
          <img
            src={b.logoUrl}
            alt={b.companyName}
            className="w-16 h-16 rounded-lg object-contain bg-white p-1 flex-shrink-0"
          />
        ) : (
          <div className="w-16 h-16 rounded-lg bg-zinc-800 flex items-center justify-center text-lg font-semibold flex-shrink-0">
            {initials}
          </div>
        )}
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold">{b.companyName}</h1>
            {b.isExternal && (
              <span className="text-xs px-1.5 py-0.5 bg-zinc-800 text-zinc-500 rounded">
                Imported
              </span>
            )}
          </div>
          <p className="text-sm text-zinc-500 mt-1">
            {b.sector || "—"} {b.city ? `· ${b.city}` : ""}
          </p>
          <div className="flex items-center gap-4 mt-3 text-sm">
            <span className="text-brand font-medium">
              {match.matchScore}% match
            </span>
            {b.verificationTier && b.verificationTier !== "unverified" && (
              <span className="text-emerald-400">{b.verificationTier}</span>
            )}
          </div>
        </div>
      </div>

      {actionError && (
        <div className="px-4 py-3 mb-4 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg text-sm">
          {actionError}
        </div>
      )}

      <div className="flex gap-2 mb-8">
        <button
          onClick={shortlist}
          disabled={match.status === "shortlisted"}
          className="px-4 py-2 bg-brand hover:bg-brand-hover rounded-lg text-sm font-medium disabled:opacity-50"
        >
          {match.status === "shortlisted" ? "Shortlisted" : "Shortlist"}
        </button>
        <button
          onClick={pass}
          className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-100 border border-zinc-800 rounded-lg"
        >
          Pass
        </button>
      </div>

      <section className="mb-8">
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">
          About
        </h2>
        <div className="p-5 bg-zinc-900 border border-zinc-800 rounded-xl">
          <p className="text-zinc-300 whitespace-pre-wrap">
            {b.description || "No description provided."}
          </p>
          <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-zinc-800 text-sm">
            <div>
              <div className="text-zinc-500">Funding ask</div>
              <div className="text-zinc-200 mt-1">
                {b.fundingAsk ? `₹${Number(b.fundingAsk).toLocaleString("en-IN")}` : "—"}
              </div>
            </div>
            <div>
              <div className="text-zinc-500">Years operating</div>
              <div className="text-zinc-200 mt-1">{b.yearsOperating ?? "—"}</div>
            </div>
            {b.websiteUrl && (
              <div className="col-span-2">
                <div className="text-zinc-500">Website</div>
                <a
                  href={b.websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand hover:underline mt-1 inline-block"
                >
                  {b.websiteUrl}
                </a>
              </div>
            )}
          </div>
        </div>
      </section>

      {match.matchReasons && match.matchReasons.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">
            Why this matched
          </h2>
          <div className="p-5 bg-zinc-900 border border-zinc-800 rounded-xl space-y-3">
            {match.matchReasons.map((r) => (
              <div key={r.factor} className="flex items-start gap-3 text-sm">
                <span
                  className={`w-5 h-5 flex items-center justify-center rounded flex-shrink-0 ${
                    r.matched
                      ? "bg-emerald-500/20 text-emerald-400"
                      : "bg-zinc-800 text-zinc-500"
                  }`}
                >
                  {r.matched ? "✓" : "·"}
                </span>
                <div>
                  <div className="text-zinc-200 capitalize">{r.factor}</div>
                  <div className="text-zinc-500 text-xs mt-0.5">{r.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">
          Active pitches
        </h2>
        {pitchesLoading ? (
          <div className="text-zinc-500 text-sm">Loading pitches...</div>
        ) : !pitches || pitches.length === 0 ? (
          <div className="p-5 bg-zinc-900 border border-zinc-800 rounded-xl text-sm text-zinc-500">
            This business hasn't published a pitch yet.
          </div>
        ) : (
          <div className="space-y-3">
            {pitches.map((pitch) => (
              <div
                key={pitch.id}
                className="p-5 bg-zinc-900 border border-zinc-800 rounded-xl"
              >
                <h3 className="font-medium text-zinc-100">{pitch.title}</h3>
                {pitch.tagline && (
                  <p className="text-sm text-zinc-500 mt-1">{pitch.tagline}</p>
                )}
                <div className="flex items-center justify-between mt-4">
                  <div className="text-sm">
                    <span className="text-zinc-400">
                      ₹{Number(pitch.askAmount).toLocaleString("en-IN")}
                    </span>
                    <span className="text-zinc-600 mx-2">·</span>
                    <span className="text-zinc-400">{pitch.equityOffered}% equity</span>
                  </div>
                  <button
                    onClick={() => setOfferPitch(pitch)}
                    className="px-3 py-1.5 bg-brand hover:bg-brand-hover rounded-lg text-sm font-medium"
                  >
                    Make offer
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {offerPitch && (
        <MakeOfferModal
          pitch={offerPitch}
          business={b}
          onClose={() => setOfferPitch(null)}
          onSuccess={() => {
            alert("Offer sent");
            refetch();
          }}
        />
      )}
    </div>
  );
}