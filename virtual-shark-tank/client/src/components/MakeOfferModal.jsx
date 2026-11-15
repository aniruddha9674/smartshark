import { useState } from "react";
import { api, getErrorMessage } from "../lib/api";

const inputClass =
  "px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 outline-none focus:border-indigo-400 w-full";

export default function MakeOfferModal({ pitch, business, onClose, onSuccess }) {
  const [form, setForm] = useState({
    amount: pitch.askAmount ? String(pitch.askAmount) : "",
    equityRequested: pitch.equityOffered ? String(pitch.equityOffered) : "",
    message: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const update = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.post("/api/offers", {
        pitchId: pitch.id,
        amount: Number(form.amount),
        equityRequested: Number(form.equityRequested),
        message: form.message || undefined,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      });
      onSuccess?.();
      onClose?.();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-6"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="w-full max-w-md flex flex-col gap-4 p-8 bg-white border border-slate-200 rounded-xl"
      >
        <div>
          <h2 className="text-xl font-semibold">Make an offer</h2>
          <p className="text-sm text-slate-500 mt-1">
            {business?.companyName} · {pitch.title}
          </p>
        </div>

        <label className="flex flex-col gap-1.5 text-sm text-slate-500">
          Amount (₹) *
          <input
            type="number"
            value={form.amount}
            onChange={update("amount")}
            className={inputClass}
            required
            min="1"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm text-slate-500">
          Equity requested (%) *
          <input
            type="number"
            step="0.1"
            value={form.equityRequested}
            onChange={update("equityRequested")}
            className={inputClass}
            required
            min="0.1"
            max="100"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm text-slate-500">
          Message (optional)
          <textarea
            rows={3}
            value={form.message}
            onChange={update("message")}
            className={inputClass}
            placeholder="Anything you want the business to know"
          />
        </label>

        <p className="text-xs text-slate-500">
          Offer expires in 7 days.
        </p>

        {error && (
          <div className="px-3 py-2 text-sm bg-red-500/10 border border-red-500/30 text-red-600 rounded-lg">
            {error}
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="btn-primary"
          >
            {loading ? "Sending..." : "Send offer"}
          </button>
        </div>
      </form>
    </div>
  );
}