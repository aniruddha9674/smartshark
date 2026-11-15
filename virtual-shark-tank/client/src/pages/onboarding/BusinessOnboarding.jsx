import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, getErrorMessage } from "../../lib/api";
import { useAuth } from "../../stores/auth";

const inputClass =
  "px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 outline-none focus:border-indigo-400";

export default function BusinessOnboarding() {
  const navigate = useNavigate();
  const loadUser = useAuth((s) => s.loadUser);
  const [form, setForm] = useState({
    companyName: "",
    sector: "",
    city: "",
    description: "",
    fundingAsk: "",
    yearsOperating: "",
    websiteUrl: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const update = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { data } = await api.post("/api/businesses", {
        companyName: form.companyName,
      });
      const businessId = data.business.id;

      const patch = {
        sector: form.sector || undefined,
        city: form.city || undefined,
        description: form.description || undefined,
        fundingAsk: form.fundingAsk ? Number(form.fundingAsk) : undefined,
        yearsOperating: form.yearsOperating ? Number(form.yearsOperating) : undefined,
        websiteUrl: form.websiteUrl || undefined,
      };
      const clean = Object.fromEntries(
        Object.entries(patch).filter(([, v]) => v !== undefined)
      );

      if (Object.keys(clean).length > 0) {
        await api.patch(`/api/businesses/${businessId}`, clean);
      }

      await loadUser();
      navigate("/dashboard");
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
        <h1 className="text-2xl font-semibold">Tell us about your business</h1>

        <input
          placeholder="Company name *"
          value={form.companyName}
          onChange={update("companyName")}
          className={inputClass}
          required
        />
        <input
          placeholder="Sector (e.g., SaaS, Foodtech)"
          value={form.sector}
          onChange={update("sector")}
          className={inputClass}
        />
        <input
          placeholder="City"
          value={form.city}
          onChange={update("city")}
          className={inputClass}
        />
        <textarea
          placeholder="Short description"
          value={form.description}
          onChange={update("description")}
          rows={3}
          className={inputClass}
        />
        <input
          placeholder="Funding ask (in ₹)"
          type="number"
          value={form.fundingAsk}
          onChange={update("fundingAsk")}
          className={inputClass}
        />
        <input
          placeholder="Years operating"
          type="number"
          value={form.yearsOperating}
          onChange={update("yearsOperating")}
          className={inputClass}
        />
        <input
          placeholder="Website URL"
          value={form.websiteUrl}
          onChange={update("websiteUrl")}
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