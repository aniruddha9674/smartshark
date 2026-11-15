import { useState } from "react";
import { useMyBusinesses } from "../../hooks/useMyBusinesses";
import {
  useReceivedOffers,
  useAcceptOffer,
  useRejectOffer,
  useCounterOffer,
} from "../../hooks/useReceivedOffers";
import { getErrorMessage } from "../../lib/api";

const statusColors = {
  pending: "bg-amber-500/10 text-amber-700",
  accepted: "bg-emerald-500/10 text-emerald-700",
  rejected: "bg-red-500/10 text-red-600",
  countered: "bg-indigo-50 text-indigo-700",
  withdrawn: "bg-slate-100 text-slate-500",
  expired: "bg-slate-100 text-slate-500",
};

export default function OffersReceived() {
  const { data: businesses } = useMyBusinesses();
  const [selectedId, setSelectedId] = useState(null);
  const [counterFor, setCounterFor] = useState(null);

  const activeId = selectedId || businesses?.[0]?.id;
  const { data: offers, isLoading, error } = useReceivedOffers(activeId);
  const accept = useAcceptOffer(activeId);
  const reject = useRejectOffer(activeId);

  if (!businesses || businesses.length === 0) {
    return (
      <div className="text-center py-16 text-slate-500">
        Create a business first to see incoming offers.
      </div>
    );
  }

  const handleAccept = async (offer) => {
    if (!confirm(`Accept ₹${Number(offer.amount).toLocaleString("en-IN")} for ${offer.equityRequested}% equity?`)) return;
    try {
      await accept.mutateAsync(offer.id);
      alert("Offer accepted. Investment created.");
    } catch (err) {
      alert(getErrorMessage(err));
    }
  };

  const handleReject = async (offerId) => {
    if (!confirm("Reject this offer?")) return;
    try {
      await reject.mutateAsync(offerId);
    } catch (err) {
      alert(getErrorMessage(err));
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Offers Received</h1>
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

      {offers?.length === 0 && (
        <div className="text-center py-16 text-slate-500">
          No offers yet. Publish a live pitch to attract investors.
        </div>
      )}

      <div className="joined-grid">
        {offers?.map((offer) => (
          <div key={offer.id} className="joined-cell p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium text-slate-900">
                    {offer.investor?.name || "Investor"}
                  </h3>
                  <span className={`text-xs px-2 py-0.5 rounded ${statusColors[offer.status] || "bg-slate-100 text-slate-500"}`}>
                    {offer.status}
                  </span>
                </div>
                {offer.pitch?.title && (
                  <div className="text-xs text-slate-500 mt-1">
                    on {offer.pitch.title}
                  </div>
                )}
                <div className="text-lg font-semibold text-slate-900 mt-3">
                  ₹{Number(offer.amount).toLocaleString("en-IN")}
                </div>
                <div className="text-sm text-slate-500">
                  for {offer.equityRequested}% equity
                  {offer.valuation && (
                    <> · valuation ₹{Number(offer.valuation).toLocaleString("en-IN")}</>
                  )}
                </div>
                {offer.message && (
                  <div className="text-sm text-slate-500 mt-3 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg">
                    "{offer.message}"
                  </div>
                )}
                <div className="text-xs text-slate-400 mt-2">
                  Sent {new Date(offer.createdAt).toLocaleString()}
                  {offer.expiresAt && ` · expires ${new Date(offer.expiresAt).toLocaleDateString()}`}
                </div>
              </div>

              {offer.status === "pending" && (
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => handleAccept(offer)}
                    disabled={accept.isPending}
                    className="btn-primary btn-sm"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => handleReject(offer.id)}
                    disabled={reject.isPending}
                    className="btn-danger btn-sm"
                  >
                    Reject
                  </button>
                  <button
                    onClick={() => setCounterFor(offer)}
                    className="btn-secondary btn-sm"
                  >
                    Counter
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {counterFor && (
        <CounterModal
          offer={counterFor}
          businessId={activeId}
          onClose={() => setCounterFor(null)}
        />
      )}
    </div>
  );
}

function CounterModal({ offer, businessId, onClose }) {
  const counter = useCounterOffer(businessId);
  const [form, setForm] = useState({
    amount: String(offer.amount || ""),
    equityRequested: String(offer.equityRequested || ""),
    message: "",
  });
  const [error, setError] = useState("");

  const update = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await counter.mutateAsync({
        offerId: offer.id,
        amount: Number(form.amount),
        equityRequested: Number(form.equityRequested),
        message: form.message || undefined,
      });
      onClose();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const inputClass =
    "px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 outline-none focus:border-indigo-400 w-full text-sm";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-6" onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="w-full max-w-md flex flex-col gap-4 p-8 bg-white border border-slate-200 rounded-xl"
      >
        <h2 className="text-xl font-semibold">Counter offer</h2>
        <p className="text-sm text-slate-500">
          Original: ₹{Number(offer.amount).toLocaleString("en-IN")} for {offer.equityRequested}%
        </p>

        <label className="flex flex-col gap-1.5 text-sm text-slate-500">
          Amount (₹)
          <input type="number" value={form.amount} onChange={update("amount")} className={inputClass} required min="1" />
        </label>

        <label className="flex flex-col gap-1.5 text-sm text-slate-500">
          Equity (%)
          <input type="number" step="0.1" value={form.equityRequested} onChange={update("equityRequested")} className={inputClass} required min="0.1" max="100" />
        </label>

        <label className="flex flex-col gap-1.5 text-sm text-slate-500">
          Message (optional)
          <textarea rows={3} value={form.message} onChange={update("message")} className={inputClass} />
        </label>

        {error && (
          <div className="px-3 py-2 text-sm bg-red-500/10 border border-red-500/30 text-red-600 rounded-lg">
            {error}
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-900 border border-slate-200 rounded-lg">
            Cancel
          </button>
          <button type="submit" disabled={counter.isPending} className="btn-primary">
            {counter.isPending ? "Sending..." : "Send counter"}
          </button>
        </div>
      </form>
    </div>
  );
}