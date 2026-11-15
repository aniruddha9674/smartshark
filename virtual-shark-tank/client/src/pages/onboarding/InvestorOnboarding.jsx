import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, getErrorMessage } from "../../lib/api";
import { useAuth } from "../../stores/auth";

const inputClass =
  "px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 outline-none focus:border-indigo-400";

export default function InvestorOnboarding() {
  const navigate = useNavigate();
  const loadUser = useAuth((s) => s.loadUser);
  const [form, setForm] = useState({
    firmName: "",
    investmentFocus: "",
    preferredGeography: "",
    minTicketSize: "",
    maxTicketSize: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const update = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.post("/api/investor/me", { firmName: form.firmName });

      const patch = {
        investmentFocus: form.investmentFocus || undefined,
        preferredGeography: form.preferredGeography || undefined,
        minTicketSize: form.minTicketSize ? Number(form.minTicketSize) : undefined,
        maxTicketSize: form.maxTicketSize ? Number(form.maxTicketSize) : undefined,
      };
      const clean = Object.fromEntries(
        Object.entries(patch).filter(([, v]) => v !== undefined)
      );

      if (Object.keys(clean).length > 0) {
        await api.patch("/api/investor/me", clean);
      }

      await loadUser();
      navigate("/dashboard/feed");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <form
        onSubmit={submit}
        className="w-full max-w-md flex flex-col gap-4 p-8 bg-white border border-slate-200 rounded-xl"
      >
        <h1 className="text-2xl font-semibold">Tell us about your fund</h1>

        <input
          placeholder="Firm name *"
          value={form.firmName}
          onChange={update("firmName")}
          className={inputClass}
          required
        />
        <input
          placeholder="Investment focus (e.g., SaaS, Foodtech)"
          value={form.investmentFocus}
          onChange={update("investmentFocus")}
          className={inputClass}
        />
        <input
          placeholder="Preferred geography (e.g., Delhi, Mumbai)"
          value={form.preferredGeography}
          onChange={update("preferredGeography")}
          className={inputClass}
        />
        <input
          placeholder="Min ticket size (₹)"
          type="number"
          value={form.minTicketSize}
          onChange={update("minTicketSize")}
          className={inputClass}
        />
        <input
          placeholder="Max ticket size (₹)"
          type="number"
          value={form.maxTicketSize}
          onChange={update("maxTicketSize")}
          className={inputClass}
        />

        {error && (
          <div className="px-3 py-2 text-sm bg-red-500/10 border border-red-500/30 text-red-600 rounded-lg">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="btn-primary"
        >
          {loading ? "Saving..." : "Continue"}
        </button>
      </form>
    </div>
  );
}