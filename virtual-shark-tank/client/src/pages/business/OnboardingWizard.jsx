import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { api, getErrorMessage } from "../../lib/api";
import { useBusiness } from "../../hooks/useMyBusinesses";
import SourceBadge from "../../components/business/SourceBadge";

const STEPS = [
  { id: "confirm", label: "Confirm" },
  { id: "fetch", label: "Fetch" },
  { id: "review", label: "Review" },
  { id: "done", label: "Done" },
];

const MCA_FIELDS = [
  { key: "companyName", label: "Company name", type: "text" },
  { key: "cin", label: "CIN", type: "text", readonly: true },
  { key: "sector", label: "Sector", type: "text" },
  { key: "city", label: "City", type: "text" },
  { key: "state", label: "State", type: "text" },
  { key: "incorporationDate", label: "Incorporated", type: "text", readonly: true },
  { key: "authorizedCapital", label: "Authorized capital (₹)", type: "text", readonly: true },
];

const DRAFTABLE_FIELDS = [
  { key: "tagline", label: "Tagline", type: "text" },
  { key: "description", label: "Description", type: "textarea" },
  { key: "businessModel", label: "Business model", type: "text" },
  { key: "targetMarket", label: "Target market", type: "text" },
  { key: "sector", label: "Sector", type: "text" },
  { key: "keyProducts", label: "Key products", type: "array" },
];

const MANUAL_FIELDS = [
  { key: "fundingAsk", label: "Funding ask (₹)", type: "number" },
  { key: "revenueRange", label: "Revenue range", type: "text", placeholder: "1Cr_10Cr" },
  { key: "customerCount", label: "Customer count", type: "number" },
  { key: "employeeCount", label: "Employee count", type: "number" },
];

export default function OnboardingWizard() {
  const navigate = useNavigate();
  const { businessId } = useParams(); // Read ID from URL
  const qc = useQueryClient();

  const { data: business, isLoading } = useBusiness(businessId);
  const [step, setStep] = useState("confirm");
  const [form, setForm] = useState({});
  const [draftResponse, setDraftResponse] = useState(null);
  const [isDrafting, setIsDrafting] = useState(false);
  const [draftError, setDraftError] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (business && Object.keys(form).length === 0) {
      const initial = {};
      for (const field of [...MCA_FIELDS, ...DRAFTABLE_FIELDS, ...MANUAL_FIELDS]) {
        if (business[field.key] != null) initial[field.key] = business[field.key];
      }
      setForm(initial);
    }
  }, [business]); // eslint-disable-line

  if (isLoading) return <SimpleSpinner message="Loading business..." />;
  if (!business) return <div className="p-6 text-center text-red-500">Business not found</div>;

  const setField = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const handleFetchDrafts = async () => {
    setIsDrafting(true);
    setDraftError(null);
    try {
      // Ensure backend has the latest website URL before scraping
      if (form.websiteUrl) {
        await api.patch(`/api/businesses/${businessId}`, {
          websiteUrl: form.websiteUrl,
        });
      }

      // Force refresh since the user explicitly clicked "Fetch drafts"
      const res = await api.post(
        `/api/businesses/${businessId}/profile-draft?refresh=1`
      );
      
      setDraftResponse(res.data);

      if (res.data.drafts) {
        const merged = { ...form };
        for (const [key, draft] of Object.entries(res.data.drafts)) {
          if (draft.value != null) merged[key] = draft.value;
        }
        setForm(merged);
      }

      setStep("review");
    } catch (err) {
      setDraftError(getErrorMessage(err));
    } finally {
      setIsDrafting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await api.patch(`/api/businesses/${businessId}`, form);

      try {
        await api.post(`/api/businesses/${businessId}/complete`);
      } catch (completeErr) {
        const body = completeErr.response?.data;
        const missing =
          body?.details?.missingFields ??
          body?.missingFields ??
          body?.details?.missing;
        if (Array.isArray(missing) && missing.length > 0) {
          setSaveError(
            `Profile saved, but missing required fields: ${missing.join(", ")}. Fill them in and try again.`
          );
          return;
        }
        throw completeErr;
      }

      setStep("done");
      qc.invalidateQueries({ queryKey: ["business", businessId] });
      qc.invalidateQueries({ queryKey: ["my-businesses"] });
    } catch (err) {
      setSaveError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <Stepper steps={STEPS} current={step} />
      {step === "confirm" && (
        <StepConfirm form={form} setField={setField} onNext={() => setStep("fetch")} />
      )}
      {step === "fetch" && (
        <StepFetch
          form={form}
          setField={setField}
          isDrafting={isDrafting}
          draftError={draftError}
          onSubmit={handleFetchDrafts}
          onBack={() => setStep("confirm")}
          onSkip={() => setStep("review")}
        />
      )}
      {step === "review" && (
        <StepReview
          form={form}
          setField={setField}
          draftResponse={draftResponse}
          saving={saving}
          saveError={saveError}
          onSave={handleSave}
          onBack={() => setStep("fetch")}
        />
      )}
      {step === "done" && (
        <StepDone
          draftResponse={draftResponse}
          onDashboard={() => navigate("/business")} // Redirect to main dashboard
        />
      )}
    </div>
  );
}

function SimpleSpinner({ message }) {
  return (
    <div className="text-center py-16">
      <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-brand" />
      {message && <p className="mt-2 text-sm text-zinc-500">{message}</p>}
    </div>
  );
}

function Stepper({ steps, current }) {
  const idx = steps.findIndex((s) => s.id === current);
  return (
    <div className="flex items-center justify-between mb-8">
      {steps.map((s, i) => {
        const done = i < idx;
        const active = i === idx;
        return (
          <div key={s.id} className="flex items-center flex-1">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                done ? "bg-emerald-500 text-white" : active ? "bg-brand text-white" : "bg-zinc-800 text-zinc-500"
              }`}
            >
              {done ? "✓" : i + 1}
            </div>
            <span className={`ml-2 text-sm ${active ? "font-medium text-zinc-100" : "text-zinc-500"}`}>
              {s.label}
            </span>
            {i < steps.length - 1 && (
              <div className={`flex-1 h-px mx-2 ${done ? "bg-emerald-500" : "bg-zinc-800"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function StepConfirm({ form, setField, onNext }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
      <h2 className="text-xl font-semibold mb-1 text-zinc-100">Confirm your business details</h2>
      <p className="text-sm text-zinc-500 mb-6">
        We pulled these from the MCA registry. Correct anything that's wrong.
      </p>
      <div className="grid grid-cols-2 gap-4">
        {MCA_FIELDS.map((f) => (
          <FieldInput
            key={f.key}
            field={f}
            value={form[f.key] ?? ""}
            onChange={(v) => setField(f.key, v)}
          />
        ))}
      </div>
      <div className="mt-6 flex justify-end">
        <button onClick={onNext} className="px-4 py-2 bg-brand hover:bg-brand-hover text-white rounded-lg font-medium transition-colors">
          Continue →
        </button>
      </div>
    </div>
  );
}

function StepFetch({ form, setField, isDrafting, draftError, onSubmit, onBack, onSkip }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
      <h2 className="text-xl font-semibold mb-1 text-zinc-100">Fetch a draft profile</h2>
      <p className="text-sm text-zinc-500 mb-6">
        We'll read your website and draft the rest of your profile. Takes ~10 seconds.
      </p>
      <div className="mb-4">
        <label className="block text-sm font-medium mb-1 text-zinc-300">Website URL</label>
        <input
          type="url"
          value={form.websiteUrl ?? ""}
          onChange={(e) => setField("websiteUrl", e.target.value)}
          placeholder="https://yourcompany.com"
          className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 focus:outline-none focus:border-brand"
          disabled={isDrafting}
        />
      </div>
      {draftError && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg">{draftError}</div>
      )}
      {isDrafting ? (
        <div className="py-8 text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-brand" />
          <p className="mt-2 text-sm text-zinc-500">Reading website, drafting fields...</p>
        </div>
      ) : (
        <div className="flex justify-between items-center mt-6">
          <button onClick={onBack} className="px-4 py-2 text-zinc-400 hover:text-zinc-100 transition-colors">← Back</button>
          <div className="space-x-3">
            <button onClick={onSkip} className="px-4 py-2 text-zinc-400 hover:text-zinc-100 transition-colors">Skip, fill manually</button>
            <button
              onClick={onSubmit}
              disabled={!form.websiteUrl}
              className="px-4 py-2 bg-brand hover:bg-brand-hover text-white rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              Fetch drafts →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function StepReview({ form, setField, draftResponse, saving, saveError, onSave, onBack }) {
  const methods = draftResponse?.extractionMethods ?? {};
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
      <h2 className="text-xl font-semibold mb-1 text-zinc-100">Review your profile</h2>
      <p className="text-sm text-zinc-500 mb-6">
        Every field was drafted for you. Edit anything wrong, then save.
      </p>
      {draftResponse?.scrapeCode && (
        <div className="mb-6 p-3 bg-amber-500/10 border border-amber-500/30 text-amber-400 text-sm rounded-lg">
          Note: we couldn't read your website. Drafts are from MCA data only.
        </div>
      )}
      <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Story</h3>
      <div className="space-y-4 mb-8">
        {DRAFTABLE_FIELDS.map((f) => (
          <DraftField
            key={f.key}
            field={f}
            value={form[f.key]}
            source={methods[f.key]}
            onChange={(v) => setField(f.key, v)}
          />
        ))}
      </div>
      <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-1">Ask & traction</h3>
      <p className="text-xs text-zinc-500 mb-3">
        These are facts, not inferences. Fill them in yourself.
      </p>
      <div className="grid grid-cols-2 gap-4 mb-8">
        {MANUAL_FIELDS.map((f) => (
          <FieldInput
            key={f.key}
            field={f}
            value={form[f.key] ?? ""}
            onChange={(v) => setField(f.key, v)}
          />
        ))}
      </div>
      {saveError && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg">{saveError}</div>
      )}
      <div className="flex justify-between items-center">
        <button onClick={onBack} className="px-4 py-2 text-zinc-400 hover:text-zinc-100 transition-colors">← Back</button>
        <button
          onClick={onSave}
          disabled={saving}
          className="px-4 py-2 bg-brand hover:bg-brand-hover text-white rounded-lg font-medium transition-colors disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save profile →"}
        </button>
      </div>
    </div>
  );
}

function StepDone({ draftResponse, onDashboard }) {
  const fieldCount = Object.keys(draftResponse?.drafts ?? {}).length;
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 text-3xl mb-4">✓</div>
      <h2 className="text-xl font-semibold mb-2 text-zinc-100">Your profile is live</h2>
      <p className="text-sm text-zinc-500 mb-6">
        {fieldCount > 0
          ? `We drafted ${fieldCount} field${fieldCount === 1 ? "" : "s"} from your website and MCA record.`
          : "Your profile has been saved."}{" "}
        Investors can now find your business.
      </p>
      <button onClick={onDashboard} className="px-6 py-2 bg-brand hover:bg-brand-hover text-white rounded-lg font-medium transition-colors">
        Go to dashboard →
      </button>
    </div>
  );
}

function FieldInput({ field, value, onChange }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1 text-zinc-300">{field.label}</label>
      {field.type === "textarea" ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          readOnly={field.readonly}
          rows={4}
          className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 focus:outline-none focus:border-brand read-only:opacity-70"
        />
      ) : (
        <input
          type={field.type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          readOnly={field.readonly}
          placeholder={field.placeholder}
          className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 focus:outline-none focus:border-brand read-only:opacity-70"
        />
      )}
    </div>
  );
}

function DraftField({ field, value, source, onChange }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="block text-sm font-medium text-zinc-300">{field.label}</label>
        {source && <SourceBadge source={source} />}
      </div>
      {field.type === "textarea" ? (
        <textarea
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          rows={4}
          className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 focus:outline-none focus:border-brand"
        />
      ) : (
        <input
          type="text"
          value={Array.isArray(value) ? value.join(", ") : value ?? ""}
          onChange={(e) => {
            if (field.type === "array") {
              onChange(e.target.value.split(",").map((s) => s.trim()).filter(Boolean));
            } else {
              onChange(e.target.value);
            }
          }}
          className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 focus:outline-none focus:border-brand"
        />
      )}
    </div>
  );
}