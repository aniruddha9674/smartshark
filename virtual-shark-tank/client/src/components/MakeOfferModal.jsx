import { useState } from "react";
import { api, getErrorMessage } from "../lib/api";

const inputClass =
  "px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 outline-none focus:border-brand w-full";

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="w-full max-w-md flex flex-col gap-4 p-8 bg-zinc-900 border border-zinc-800 rounded-xl"
      >
        <div>
          <h2 className="text-xl font-semibold">Make an offer</h2>
          <p className="text-sm text-zinc-500 mt-1">
            {business?.companyName} · {pitch.title}
          </p>
        </div>

        <label className="flex flex-col gap-1.5 text-sm text-zinc-400">
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

        <label className="flex flex-col gap-1.5 text-sm text-zinc-400">
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

        <label className="flex flex-col gap-1.5 text-sm text-zinc-400">
          Message (optional)
          <textarea
            rows={3}
            value={form.message}
            onChange={update("message")}
            className={inputClass}
            placeholder="Anything you want the business to know"
          />
        </label>

        <p className="text-xs text-zinc-500">
          Offer expires in 7 days.
        </p>

        {error && (
          <div className="px-3 py-2 text-sm bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg">
            {error}
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-100 border border-zinc-800 rounded-lg"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 bg-brand hover:bg-brand-hover rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {loading ? "Sending..." : "Send offer"}
          </button>
        </div>
      </form>
    </div>
  );
}