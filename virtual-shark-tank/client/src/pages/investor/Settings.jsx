import { useEffect, useState } from "react";
import { api, getErrorMessage } from "../../lib/api";
import { useAuth } from "../../stores/auth";

const INPUT =
  "w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-900 text-sm outline-none transition-colors focus:border-indigo-400 focus:ring-[3px] focus:ring-indigo-100";

export default function Settings() {
  const user = useAuth((s) => s.user);
  const isInvestor = !!user?.capabilities?.isInvestor;

  const [form, setForm] = useState({
    investmentFocus: "",
    preferredGeography: "",
    minTicketSize: "",
    maxTicketSize: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [missingProfile, setMissingProfile] = useState(false);

  useEffect(() => {
    if (!isInvestor) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const res = await api.get("/api/investor/me");
        const profile = res.data?.profile;
        if (!profile || cancelled) return;

        setForm({
          investmentFocus: profile.investmentFocus || "",
          preferredGeography: profile.preferredGeography || "",
          minTicketSize:
            profile.minTicketSize != null ? String(profile.minTicketSize) : "",
          maxTicketSize:
            profile.maxTicketSize != null ? String(profile.maxTicketSize) : "",
        });
      } catch (err) {
        if (err.response?.status === 403 || err.response?.status === 404) {
          setMissingProfile(true);
        } else {
          setError(getErrorMessage(err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isInvestor]);

  const update = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const save = async (e) => {
    e.preventDefault();
    setError("");
    setSaved(false);

    const payload = {};
    if (form.investmentFocus.trim()) {
      payload.investmentFocus = form.investmentFocus.trim();
    }
    if (form.preferredGeography.trim()) {
      payload.preferredGeography = form.preferredGeography.trim();
    }
    if (form.minTicketSize !== "") {
      payload.minTicketSize = Number(form.minTicketSize);
    }
    if (form.maxTicketSize !== "") {
      payload.maxTicketSize = Number(form.maxTicketSize);
    }

    if (Object.keys(payload).length === 0) {
      setError("Enter at least one preference before saving.");
      return;
    }

    setSaving(true);
    try {
      await api.patch("/api/investor/me", payload);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (!isInvestor) {
    return (
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-semibold mb-6">Settings</h1>
        <div className="p-6 bg-white border border-slate-200 rounded-xl text-sm text-slate-500">
          Investment preferences are available for investor accounts.
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-semibold mb-6">Settings</h1>

      <form
        onSubmit={save}
        className="bg-white border border-slate-200 rounded-xl p-6"
      >
        <h2 className="overline mb-4">
          Investment Preferences
        </h2>

        {loading ? (
          <p className="text-sm text-slate-500">Loading...</p>
        ) : missingProfile ? (
          <p className="text-sm text-slate-500">
            No investor profile found. Complete investor onboarding first.
          </p>
        ) : (
          <div className="space-y-4">
            <label className="block">
              <span className="text-xs text-slate-500 mb-1.5 block">
                Preferred sectors
              </span>
              <input
                value={form.investmentFocus}
                onChange={update("investmentFocus")}
                className={INPUT}
                placeholder="SaaS, Fintech, Climate"
              />
              <span className="text-xs text-slate-400 mt-1 block">
                Comma-separated. Used to pre-filter your feed by default.
              </span>
            </label>

            <label className="block">
              <span className="text-xs text-slate-500 mb-1.5 block">
                Preferred geography
              </span>
              <input
                value={form.preferredGeography}
                onChange={update("preferredGeography")}
                className={INPUT}
                placeholder="India, Southeast Asia"
              />
            </label>

            <div className="grid grid-cols-2 gap-4">
              <label className="block">
                <span className="text-xs text-slate-500 mb-1.5 block">
                  Min ticket size (₹)
                </span>
                <input
                  type="number"
                  min="0"
                  value={form.minTicketSize}
                  onChange={update("minTicketSize")}
                  className={INPUT}
                  placeholder="500000"
                />
              </label>

              <label className="block">
                <span className="text-xs text-slate-500 mb-1.5 block">
                  Max ticket size (₹)
                </span>
                <input
                  type="number"
                  min="0"
                  value={form.maxTicketSize}
                  onChange={update("maxTicketSize")}
                  className={INPUT}
                  placeholder="5000000"
                />
              </label>
            </div>

            {error && (
                <div className="alert-danger px-3 py-2 text-xs">
                  {error}
                </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              {saved && <span className="text-xs text-emerald-700">Saved ✓</span>}
              <button
                type="submit"
                disabled={saving}
                className="btn-primary"
              >
                {saving ? "Saving..." : "Save preferences"}
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
