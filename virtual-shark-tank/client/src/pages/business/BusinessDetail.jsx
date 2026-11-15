import { useState, useEffect, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { api, getErrorMessage } from "../../lib/api";

const SECTIONS = ["about", "funding", "traction", "team", "social", "products", "risks"];

export default function BusinessDetail() {
  const { businessId } = useParams();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState("profile");

  const { data: business, isLoading, error } = useQuery({
    queryKey: ["business", businessId],
    queryFn: async () => {
      const res = await api.get(`/api/businesses/${businessId}`);
      return res.data.business;
    },
    enabled: !!businessId,
  });

  if (isLoading) return <div className="p-8 text-slate-500">Loading...</div>;
  if (error) return <div className="p-8 text-red-600">{getErrorMessage(error)}</div>;
  if (!business) return <div className="p-8 text-slate-500">Not found</div>;

  return (
    <div className="max-w-4xl mx-auto">
      <Link to="/dashboard/businesses" className="text-sm text-slate-500 hover:text-slate-700 mb-4 inline-block">
        ← Back to businesses
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">{business.companyName}</h1>
        <p className="text-sm text-slate-500 mt-1">
          {business.sector || "—"} · {business.city || "—"} ·{" "}
          {business.companyStatus || business.company_status || "—"}
        </p>
      </div>

      <div className="flex gap-2 mb-6 border-b border-slate-200 overflow-x-auto">
        {["profile", "pitches", "documents", "history"].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm capitalize border-b-2 -mb-px transition-colors ${
              activeTab === tab
                ? "border-slate-900 text-slate-900"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === "profile" && <ProfileTab business={business} businessId={businessId} />}
      {activeTab === "pitches" && <PitchesTab business={business} businessId={businessId} />}
      {activeTab === "documents" && <DocumentsTab business={business} businessId={businessId} />}
      {activeTab === "history" && <HistoryTab businessId={businessId} />}
    </div>
  );
}

// ─── Profile tab — 7 sections ────────────────────────────────

function ProfileTab({ business, businessId }) {
  const qc = useQueryClient();
  const isComplete = business.isProfileComplete === true || business.isProfileComplete === "true";
  
  const [isDrafting, setIsDrafting] = useState(false);
  const [draftError, setDraftError] = useState("");
  const [previewDrafts, setPreviewDrafts] = useState(null);
  
  // Track URL and file in the AI block
  const [aiUrl, setAiUrl] = useState(business.websiteUrl || "");
  const [aiFile, setAiFile] = useState(null);
  const aiFileInputRef = useRef(null);

  const handleAiDraft = async () => {
    if (!aiFile && !aiUrl) {
      setDraftError("Please enter your website URL or upload a document first.");
      return;
    }
    
    setIsDrafting(true);
    setDraftError("");
    setPreviewDrafts(null);
    
    try {
      let documentUrl = null;

      if (aiFile) {
        // 1a. Upload the file first and use its URL for the draft
        const formData = new FormData();
        formData.append("file", aiFile);
        const uploadRes = await api.post("/api/uploads", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        documentUrl = uploadRes.data?.data?.url;
      } else if (aiUrl !== business.websiteUrl) {
        // 1b. Save the URL to the DB first so the backend scrapes the right site
        await api.patch(`/api/businesses/${businessId}`, { websiteUrl: aiUrl });
      }

      // 2. Trigger the AI Draft
      const res = await api.post(
        `/api/businesses/${businessId}/profile-draft?refresh=1`,
        documentUrl ? { documentUrl } : {},
        { timeout: 45000 }
      );
      
      const drafts = res.data.drafts;
      
      if (!drafts || Object.keys(drafts).length === 0) {
        setDraftError("AI couldn't find enough data on this website to auto-fill.");
        return;
      }

      setPreviewDrafts(drafts);
      
    } catch (err) {
      setDraftError(err.code === 'ECONNABORTED' 
        ? "The AI took too long to respond. Please try again." 
        : getErrorMessage(err));
    } finally {
      setIsDrafting(false);
    }
  };

  const applyDrafts = async () => {
    if (!previewDrafts) return;
    setIsDrafting(true);
    try {
      const payload = {};
      for (const [key, val] of Object.entries(previewDrafts)) {
         payload[key] = val.value; 
      }

      await api.patch(`/api/businesses/${businessId}`, payload);
      
      setPreviewDrafts(null);
      qc.invalidateQueries({ queryKey: ["business", businessId] });
      
    } catch (err) {
      setDraftError(getErrorMessage(err));
    } finally {
      setIsDrafting(false);
    }
  };

  return (
    <div key={business.updatedAt || Date.now()}>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {/* AI Magic Block */}
        <div className="flex flex-col gap-4 border-b border-slate-200 bg-gradient-to-r from-indigo-100 via-white to-white p-5 md:flex-row md:items-center md:justify-between">
        <div className="flex-1">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Sparkles className="h-4 w-4 text-orange-600" />
            Auto-fill with AI
          </h3>
          <p className="text-xs text-slate-700 mt-1 max-w-md">
            We'll read your website and draft your description, tagline, business model, and products.
          </p>
          {draftError && <p className="text-xs text-red-600 mt-2">{draftError}</p>}
          
          <div className="mt-3 flex flex-col sm:flex-row sm:items-center gap-2 max-w-sm">
            <input
              type="url"
              value={aiUrl}
              onChange={(e) => setAiUrl(e.target.value)}
              placeholder="https://yourcompany.com"
              className="flex-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-800 text-sm outline-none transition-colors focus:border-indigo-400 focus:ring-[3px] focus:ring-indigo-100 disabled:opacity-50"
              disabled={isDrafting || !!aiFile}
            />
            <span className="text-xs text-slate-500 text-center">OR</span>
            <input
              ref={aiFileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={(e) => {
                const file = e.target.files?.[0] || null;
                setAiFile(file);
                if (file) setAiUrl("");
              }}
              className="flex-1 text-xs text-slate-500 file:mr-2 file:px-2 file:py-1.5 file:bg-slate-100 file:text-slate-900 file:border-0 file:rounded-lg file:text-xs file:font-medium file:cursor-pointer hover:file:bg-slate-200 disabled:opacity-50"
              disabled={isDrafting}
            />
            {aiFile && (
              <button
                type="button"
                onClick={() => {
                  setAiFile(null);
                  setAiUrl(business.websiteUrl || "");
                  if (aiFileInputRef.current) aiFileInputRef.current.value = "";
                }}
                className="px-2 py-1.5 text-xs text-slate-500 hover:text-red-600 border border-slate-300 rounded-lg"
                title="Remove file"
              >
                ×
              </button>
            )}
          </div>
        </div>

        <button
          onClick={handleAiDraft}
          disabled={isDrafting || previewDrafts}
          className="btn-accent whitespace-nowrap"
        >
          {isDrafting && !previewDrafts ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-900/30 border-t-slate-900" />
              Scanning...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              Auto-fill
            </>
          )}
        </button>
      </div>

        <div className="divide-y divide-slate-200">
          <MediaSection business={business} businessId={businessId} />
          <AboutSection business={business} businessId={businessId} />
          <FundingSection business={business} businessId={businessId} />
          <TractionSection business={business} businessId={businessId} />
          <TeamSection business={business} businessId={businessId} />
          <SocialSection business={business} businessId={businessId} />
          <ProductsSection business={business} businessId={businessId} />
          <RisksSection business={business} businessId={businessId} />
        </div>

        {/* Profile status section */}
        <section className="border-t border-slate-200 bg-slate-50 p-6 sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="overline mb-1">
              Profile status
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              {isComplete
                ? "Your profile is marked complete. You can publish pitches."
                : "Fill in the sections above, then mark your profile complete to unlock pitch publishing."}
            </p>
          </div>
          {isComplete ? (
            <span className="badge-success px-3 py-1.5 text-sm whitespace-nowrap">
              ✓ Complete
            </span>
          ) : (
            <CompleteButton
              businessId={businessId}
              onSuccess={() => qc.invalidateQueries({ queryKey: ["business", businessId] })}
            />
          )}
        </div>
        </section>
      </div>

      {/* ─── DRAFTS REVIEW MODAL ─── */}
      {previewDrafts && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-6" onClick={() => setPreviewDrafts(null)}>
          <div 
            className="w-full max-w-2xl max-h-[85vh] flex flex-col bg-white border border-slate-200 rounded-xl shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-slate-200">
              <h2 className="text-xl font-semibold text-slate-900">Review AI Drafts</h2>
              <p className="text-sm text-slate-500 mt-1">
                Here's what we found on your website. Click Apply to save these to your profile.
              </p>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              {Object.entries(previewDrafts).map(([key, draft]) => (
                <div key={key} className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-slate-700 capitalize">
                      {key.replace(/([A-Z])/g, ' $1').trim()}
                    </label>
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                      draft.source === 'llm' ? 'bg-orange-100 text-orange-700' : 'bg-indigo-50 text-indigo-700'
                    }`}>
                      {draft.source === 'llm' ? 'AI Draft' : 'Website Data'}
                    </span>
                  </div>
                  <textarea
                    value={Array.isArray(draft.value) ? draft.value.join(", ") : draft.value}
                    readOnly
                    rows={2}
                    className="w-full px-3 py-2 bg-slate-100 border border-slate-300 rounded-lg text-slate-700 text-sm outline-none"
                  />
                </div>
              ))}
            </div>

            <div className="p-6 border-t border-slate-200 flex justify-end gap-3">
              <button onClick={() => setPreviewDrafts(null)} className="btn-ghost">
                Cancel
              </button>
              <button onClick={applyDrafts} disabled={isDrafting} className="btn-primary">
                {isDrafting ? "Saving..." : "Apply to Profile"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
function EditableSection({ title, children, onSave, saving, saved, error }) {
  return (
    <section className="bg-white p-6 sm:p-7">
      <div className="flex items-center justify-between mb-4">
        <h2 className="overline">{title}</h2>
        <div className="flex items-center gap-2">
          {saved && <span className="text-xs font-medium text-emerald-700">Saved ✓</span>}
          <button
            onClick={onSave}
            disabled={saving}
            className="btn-primary btn-sm"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
      {error && (
        <div className="alert-danger mb-4 px-3 py-2 text-xs">
          {error}
        </div>
      )}
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Field({ label, children, hint }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

const INPUT = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition-colors focus:border-indigo-400 focus:ring-[3px] focus:ring-indigo-100";

// ─── About ────────────────────────────────────────────────────

function AboutSection({ business, businessId }) {
  const qc = useQueryClient();
  // Use camelCase
  const [form, setForm] = useState({
    tagline: business.tagline || "",
    description: business.description || "",
    businessModel: business.businessModel || "",
    targetMarket: business.targetMarket || "",
    differentiation: business.differentiation || "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    setSaving(true); setError(""); setSaved(false);
    try {
      await api.patch(`/api/businesses/${businessId}`, form);
      qc.invalidateQueries({ queryKey: ["business", businessId] });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const update = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <EditableSection title="About" onSave={save} saving={saving} saved={saved} error={error}>
      <Field label="Tagline" hint="One sentence under the company name">
        <input value={form.tagline} onChange={update("tagline")} maxLength={300} className={INPUT} placeholder="Preventive healthcare for urban families" />
      </Field>
      <Field label="Description" hint="A paragraph describing the business">
        <textarea value={form.description} onChange={update("description")} rows={5} className={INPUT} placeholder="What the business does, who it serves, and why it exists." />
      </Field>
      <Field label="Business model">
        <input value={form.businessModel} onChange={update("businessModel")} className={INPUT} placeholder="B2B SaaS, B2C marketplace, subscription, etc." />
      </Field>
      <Field label="Target market">
        <input value={form.targetMarket} onChange={update("targetMarket")} className={INPUT} placeholder="Who buys this and where" />
      </Field>
      <Field label="Differentiation">
        <textarea value={form.differentiation} onChange={update("differentiation")} rows={3} className={INPUT} placeholder="What makes this business different from alternatives" />
      </Field>
    </EditableSection>
  );
}
// ─── Funding ──────────────────────────────────────────────────

function FundingSection({ business, businessId }) {
  const qc = useQueryClient();
  // Use camelCase
  const [form, setForm] = useState({
    fundingAsk: business.fundingAsk || "",
    fundingInstrument: business.fundingInstrument || "",
    useOfFunds: business.useOfFunds || [],
    plannedMilestones: business.plannedMilestones || [],
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    setSaving(true); setError(""); setSaved(false);
    try {
      const payload = {
        ...form,
        fundingAsk: form.fundingAsk ? Number(form.fundingAsk) : null,
        fundingInstrument: form.fundingInstrument || null,
      };
      await api.patch(`/api/businesses/${businessId}`, payload);
      qc.invalidateQueries({ queryKey: ["business", businessId] });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const addFund = () => setForm({ ...form, useOfFunds: [...form.useOfFunds, { category: "", pct: 0, description: "" }] });
  const removeFund = (i) => setForm({ ...form, useOfFunds: form.useOfFunds.filter((_, idx) => idx !== i) });
  const updateFund = (i, k, v) => {
    const next = [...form.useOfFunds];
    next[i] = { ...next[i], [k]: k === "pct" ? Number(v) : v };
    setForm({ ...form, useOfFunds: next });
  };

  const addMilestone = () => setForm({ ...form, plannedMilestones: [...form.plannedMilestones, { months: 12, milestone: "" }] });
  const removeMilestone = (i) => setForm({ ...form, plannedMilestones: form.plannedMilestones.filter((_, idx) => idx !== i) });
  const updateMilestone = (i, k, v) => {
    const next = [...form.plannedMilestones];
    next[i] = { ...next[i], [k]: k === "months" ? Number(v) : v };
    setForm({ ...form, plannedMilestones: next });
  };

  return (
    <EditableSection title="Funding" onSave={save} saving={saving} saved={saved} error={error}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Funding ask (₹)">
          <input type="number" value={form.fundingAsk} onChange={(e) => setForm({ ...form, fundingAsk: e.target.value })} className={INPUT} placeholder="5000000" />
        </Field>
        <Field label="Instrument">
          <select value={form.fundingInstrument} onChange={(e) => setForm({ ...form, fundingInstrument: e.target.value })} className={INPUT}>
            <option value="">Select...</option>
            <option value="equity">Equity</option>
            <option value="debt">Debt</option>
            <option value="revenue_share">Revenue share</option>
            <option value="hybrid">Hybrid</option>
          </select>
        </Field>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-slate-500">Use of funds</span>
          <button onClick={addFund} className="text-xs text-slate-900 hover:text-slate-600">+ Add item</button>
        </div>
        <div className="space-y-2">
          {form.useOfFunds.map((u, i) => (
            <div key={i} className="flex flex-col gap-2 sm:flex-row sm:items-start">
              <input value={u.category} onChange={(e) => updateFund(i, "category", e.target.value)} placeholder="Category" className={INPUT + " flex-1"} />
              <input type="number" value={u.pct} onChange={(e) => updateFund(i, "pct", e.target.value)} placeholder="%" className={INPUT + " w-full sm:w-20"} min="0" max="100" />
              <input value={u.description || ""} onChange={(e) => updateFund(i, "description", e.target.value)} placeholder="Details (optional)" className={INPUT + " flex-1"} />
              <button onClick={() => removeFund(i)} className="text-slate-400 hover:text-red-600 px-2 py-2">×</button>
            </div>
          ))}
          {form.useOfFunds.length === 0 && (
            <p className="text-xs text-slate-400">No items yet</p>
          )}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-slate-500">Planned milestones</span>
          <button onClick={addMilestone} className="text-xs text-slate-900 hover:text-slate-600">+ Add milestone</button>
        </div>
        <div className="space-y-2">
          {form.plannedMilestones.map((m, i) => (
            <div key={i} className="flex flex-col gap-2 sm:flex-row sm:items-start">
              <input type="number" value={m.months} onChange={(e) => updateMilestone(i, "months", e.target.value)} placeholder="Months" className={INPUT + " w-full sm:w-24"} min="1" />
              <input value={m.milestone} onChange={(e) => updateMilestone(i, "milestone", e.target.value)} placeholder="e.g. 5 clinics, ₹8 Cr revenue" className={INPUT + " flex-1"} />
              <button onClick={() => removeMilestone(i)} className="text-slate-400 hover:text-red-600 px-2 py-2">×</button>
            </div>
          ))}
          {form.plannedMilestones.length === 0 && (
            <p className="text-xs text-slate-400">No milestones yet</p>
          )}
        </div>
      </div>
    </EditableSection>
  );
}
// ─── Traction ─────────────────────────────────────────────────

function TractionSection({ business, businessId }) {
  const qc = useQueryClient();
  // Use camelCase
  const [form, setForm] = useState({
    revenueRange: business.revenueRange || "",
    revenueSource: business.revenueSource || "",
    revenueTrendBracket: business.revenueTrendBracket || "",
    customerCount: business.customerCount || "",
    repeatCustomerPct: business.repeatCustomerPct || "",
    monthlyOrderVolume: business.monthlyOrderVolume || "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    setSaving(true); setError(""); setSaved(false);
    try {
      const payload = { ...form };
      payload.customerCount = payload.customerCount ? Number(payload.customerCount) : null;
      payload.repeatCustomerPct = payload.repeatCustomerPct ? Number(payload.repeatCustomerPct) : null;
      payload.monthlyOrderVolume = payload.monthlyOrderVolume ? Number(payload.monthlyOrderVolume) : null;
      await api.patch(`/api/businesses/${businessId}`, payload);
      qc.invalidateQueries({ queryKey: ["business", businessId] });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const update = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <EditableSection title="Traction" onSave={save} saving={saving} saved={saved} error={error}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Revenue range" hint="e.g. 3-5 Cr, 50L-1Cr, pre-revenue">
          <input value={form.revenueRange} onChange={update("revenueRange")} className={INPUT} placeholder="e.g. 3-5 Cr" />
        </Field>
        <Field label="Revenue source" hint="How do you know this figure?">
          <input value={form.revenueSource} onChange={update("revenueSource")} className={INPUT} placeholder="self_reported, GST, bank statements" />
        </Field>
        <Field label="Trend">
          <select value={form.revenueTrendBracket} onChange={update("revenueTrendBracket")} className={INPUT}>
            <option value="">Select...</option>
            <option value="declining">Declining</option>
            <option value="flat">Flat</option>
            <option value="growing_20">Growing 20% YoY</option>
            <option value="growing_50">Growing 50% YoY</option>
            <option value="growing_100">Growing 100%+ YoY</option>
          </select>
        </Field>
        <Field label="Customer count">
          <input type="number" value={form.customerCount} onChange={update("customerCount")} className={INPUT} />
        </Field>
        <Field label="Repeat customer %">
          <input type="number" value={form.repeatCustomerPct} onChange={update("repeatCustomerPct")} className={INPUT} min="0" max="100" />
        </Field>
        <Field label="Monthly order volume">
          <input type="number" value={form.monthlyOrderVolume} onChange={update("monthlyOrderVolume")} className={INPUT} />
        </Field>
      </div>
    </EditableSection>
  );
}
// ─── Team ─────────────────────────────────────────────────────

function TeamSection({ business, businessId }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    employee_count: business.employeeCount || "",
    employee_count_source: business.employeeCountSource || "self_declared",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    setSaving(true); setError(""); setSaved(false);
    try {
      await api.patch(`/api/businesses/${businessId}`, {
        employee_count: form.employee_count ? Number(form.employee_count) : null,
        employee_count_source: form.employee_count_source,
      });
      qc.invalidateQueries({ queryKey: ["business", businessId] });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <EditableSection title="Team" onSave={save} saving={saving} saved={saved} error={error}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Employee count">
          <input type="number" value={form.employee_count} onChange={(e) => setForm({ ...form, employee_count: e.target.value })} className={INPUT} min="0" />
        </Field>
        <Field label="Source">
          <select value={form.employee_count_source} onChange={(e) => setForm({ ...form, employee_count_source: e.target.value })} className={INPUT}>
            <option value="self_declared">Self-declared</option>
            <option value="public_filing">Public filing</option>
            <option value="curated">Curated</option>
          </select>
        </Field>
      </div>
    </EditableSection>
  );
}

// ─── Social ───────────────────────────────────────────────────

function SocialSection({ business, businessId }) {
  const qc = useQueryClient();
  // Fix: use camelCase keys
  const [form, setForm] = useState({
    websiteUrl: business.websiteUrl || "",
    linkedinUrl: business.linkedinUrl || "",
    twitterUrl: business.twitterUrl || "",
  });
  
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    setSaving(true); setError(""); setSaved(false);
    try {
      // This will now correctly send websiteUrl, linkedinUrl, etc.
      await api.patch(`/api/businesses/${businessId}`, form);
      qc.invalidateQueries({ queryKey: ["business", businessId] });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const update = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <EditableSection title="Digital presence" onSave={save} saving={saving} saved={saved} error={error}>
      <Field label="Website">
        <input type="url" value={form.websiteUrl} onChange={update("websiteUrl")} className={INPUT} placeholder="https://..." />
      </Field>
      <Field label="LinkedIn">
        <input type="url" value={form.linkedinUrl} onChange={update("linkedinUrl")} className={INPUT} placeholder="https://linkedin.com/company/..." />
      </Field>
      <Field label="Twitter / X">
        <input type="url" value={form.twitterUrl} onChange={update("twitterUrl")} className={INPUT} placeholder="https://x.com/..." />
      </Field>
    </EditableSection>
  );
}
// ─── Branding & Media ─────────────────────────────────────────

function MediaSection({ business, businessId }) {
  const qc = useQueryClient();
  const [logoUrl, setLogoUrl] = useState(business.logoUrl || "");
  const [coverImageUrl, setCoverImageUrl] = useState(business.coverImageUrl || "");
  const [uploading, setUploading] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const upload = async (file, field) => {
    if (!file) return;
    setUploading(field);
    setError("");
    setSaved(false);

    try {
      const formData = new FormData();
      formData.append("file", file);
      const uploadRes = await api.post("/api/uploads", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const url = uploadRes.data?.data?.url;
      if (!url) throw new Error("Upload did not return a URL");

      await api.patch(`/api/businesses/${businessId}`, { [field]: url });
      if (field === "logoUrl") setLogoUrl(url);
      else setCoverImageUrl(url);

      qc.invalidateQueries({ queryKey: ["business", businessId] });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setUploading("");
    }
  };

  const save = async () => {
    setUploading("save");
    setError("");
    setSaved(false);
    try {
      const payload = {};
      if (logoUrl) payload.logoUrl = logoUrl;
      if (coverImageUrl) payload.coverImageUrl = coverImageUrl;
      if (Object.keys(payload).length === 0) return;

      await api.patch(`/api/businesses/${businessId}`, payload);
      qc.invalidateQueries({ queryKey: ["business", businessId] });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setUploading("");
    }
  };

  return (
    <EditableSection
      title="Branding & Media"
      onSave={save}
      saving={!!uploading}
      saved={saved}
      error={error}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Company logo" hint="Square image, PNG or JPG">
          <div className="space-y-2">
            {logoUrl && (
              <img
                src={logoUrl}
                alt="Company logo"
                className="w-20 h-20 object-contain bg-slate-50 border border-slate-200 rounded-lg"
              />
            )}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => {
                const file = e.target.files?.[0];
                upload(file, "logoUrl");
                e.target.value = "";
              }}
              disabled={!!uploading}
              className="w-full text-sm text-slate-500 file:mr-3 file:px-3 file:py-2 file:bg-slate-100 file:text-slate-900 file:border-0 file:rounded-lg file:text-sm file:font-medium file:cursor-pointer hover:file:bg-slate-200 disabled:opacity-50"
            />
            {uploading === "logoUrl" && (
              <span className="text-xs text-slate-500">Uploading logo...</span>
            )}
          </div>
        </Field>

        <Field label="Cover image" hint="Wide 16:9 image, PNG or JPG">
          <div className="space-y-2">
            {coverImageUrl && (
              <img
                src={coverImageUrl}
                alt="Cover"
                className="w-full h-20 object-cover bg-slate-50 border border-slate-200 rounded-lg"
              />
            )}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => {
                const file = e.target.files?.[0];
                upload(file, "coverImageUrl");
                e.target.value = "";
              }}
              disabled={!!uploading}
              className="w-full text-sm text-slate-500 file:mr-3 file:px-3 file:py-2 file:bg-slate-100 file:text-slate-900 file:border-0 file:rounded-lg file:text-sm file:font-medium file:cursor-pointer hover:file:bg-slate-200 disabled:opacity-50"
            />
            {uploading === "coverImageUrl" && (
              <span className="text-xs text-slate-500">Uploading cover image...</span>
            )}
          </div>
        </Field>
      </div>
    </EditableSection>
  );
}

// ─── Products ─────────────────────────────────────────────────

function ProductsSection({ business, businessId }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    key_products: (business.keyProducts || []).join(", "),
    notable_clients: (business.notableClients || []).join(", "),
    competitors: (business.competitors || []).join(", "),
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    setSaving(true); setError(""); setSaved(false);
    try {
      const payload = {
        key_products: form.key_products.split(",").map((s) => s.trim()).filter(Boolean),
        notable_clients: form.notable_clients.split(",").map((s) => s.trim()).filter(Boolean),
        competitors: form.competitors.split(",").map((s) => s.trim()).filter(Boolean),
      };
      await api.patch(`/api/businesses/${businessId}`, payload);
      qc.invalidateQueries({ queryKey: ["business", businessId] });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const update = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <EditableSection title="Products & clients" onSave={save} saving={saving} saved={saved} error={error}>
      <Field label="Key products" hint="Comma-separated">
        <input value={form.key_products} onChange={update("key_products")} className={INPUT} placeholder="Product A, Product B, Product C" />
      </Field>
      <Field label="Notable clients" hint="Comma-separated">
        <input value={form.notable_clients} onChange={update("notable_clients")} className={INPUT} placeholder="Client 1, Client 2" />
      </Field>
      <Field label="Competitors" hint="Comma-separated">
        <input value={form.competitors} onChange={update("competitors")} className={INPUT} placeholder="Competitor A, Competitor B" />
      </Field>
    </EditableSection>
  );
}

// ─── Risks ────────────────────────────────────────────────────

function RisksSection({ business, businessId }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    self_declared_risks: business.selfDeclaredRisks || "",
    litigation_notes: business.litigationNotes || "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    setSaving(true); setError(""); setSaved(false);
    try {
      await api.patch(`/api/businesses/${businessId}`, form);
      qc.invalidateQueries({ queryKey: ["business", businessId] });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <EditableSection title="Risks & disclosures" onSave={save} saving={saving} saved={saved} error={error}>
      <Field label="Self-declared risks" hint="Be honest — investors value transparency">
        <textarea value={form.self_declared_risks} onChange={(e) => setForm({ ...form, self_declared_risks: e.target.value })} rows={4} className={INPUT} placeholder="Customer concentration, key supplier dependency, seasonality..." />
      </Field>
      <Field label="Litigation notes">
        <textarea value={form.litigation_notes} onChange={(e) => setForm({ ...form, litigation_notes: e.target.value })} rows={3} className={INPUT} placeholder="None, or details of any pending matters" />
      </Field>
    </EditableSection>
  );
}

// ─── Pitches tab ─────────────────────────────────────────────

function PitchesTab({ business, businessId }) {
  const qc = useQueryClient();
  // modalState: false (closed) | "new" (create mode) | pitch object (edit mode)
  const [modalState, setModalState] = useState(false);

  const { data: pitches, isLoading } = useQuery({
    queryKey: ["pitches", businessId],
    queryFn: async () => {
      const res = await api.get(`/api/pitches/me?businessId=${businessId}`);
      return res.data.pitches || res.data;
    },
    enabled: !!businessId,
  });

  const isProfileComplete = business.isProfileComplete === true || business.isProfileComplete === "true";

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["pitches", businessId] });
    qc.invalidateQueries({ queryKey: ["business", businessId] });
  };

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      {!isProfileComplete && (
        <div className="border-b border-amber-200 bg-amber-50 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-amber-800">Profile incomplete</h3>
              <p className="mt-1 text-sm text-amber-800">
                Complete your profile and mark it complete before publishing a pitch.
              </p>
            </div>
            <CompleteButton businessId={businessId} onSuccess={refresh} />
          </div>
        </div>
      )}

      {isProfileComplete && (
        <div className="flex items-center justify-between border-b border-emerald-200 bg-emerald-50 p-4">
          <span className="text-sm text-emerald-700">Profile marked complete</span>
        </div>
      )}

      <section className="p-6 sm:p-7">
        <div className="flex items-center justify-between mb-4">
          <h2 className="overline">
            Pitches
          </h2>
          <button
            onClick={() => setModalState("new")}
            className="btn-primary btn-sm"
          >
            + New pitch
          </button>
        </div>

        {isLoading && <p className="text-sm text-slate-500">Loading...</p>}

        {!isLoading && (!pitches || pitches.length === 0) && (
          <p className="text-sm text-slate-500">
            No pitches yet. Create one to start raising.
          </p>
        )}

        <div className="space-y-3">
          {pitches?.map((pitch) => (
            <PitchCard
              key={pitch.id}
              pitch={pitch}
              onRefresh={refresh}
              onEdit={(p) => setModalState(p)}
            />
          ))}
        </div>
      </section>

      {modalState && (
        <PitchFormModal
          businessId={businessId}
          pitch={typeof modalState === "object" ? modalState : null}
          onClose={() => setModalState(false)}
          onSuccess={() => {
            setModalState(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}

// ─── Complete button ────────────────────────────────────────

function CompleteButton({ businessId, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const complete = async () => {
    setLoading(true);
    setError("");
    try {
      await api.post(`/api/businesses/${businessId}/complete`);
      onSuccess();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={complete}
        disabled={loading}
        className="btn-primary btn-sm whitespace-nowrap"
      >
        {loading ? "Marking..." : "Mark complete"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}

// ─── Pitch card (list item) ─────────────────────────────────

function PitchCard({ pitch, onRefresh, onEdit }) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const STATUS_COLOR = {
    draft: "bg-slate-100 text-slate-500 border-slate-300",
    live: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
    closed: "bg-slate-100 text-slate-500 border-slate-300",
    funded: "bg-indigo-50 text-indigo-700 border-indigo-200",
    withdrawn: "bg-slate-100 text-slate-500 border-slate-300",
  };

  const publish = async () => {
    setBusy("publish"); setError("");
    try {
      await api.post(`/api/pitches/${pitch.id}/publish`);
      onRefresh();
    } catch (err) {
      const data = err.response?.data;
      const base = data?.error || getErrorMessage(err);
      const missing = data?.details?.missingFields;
      const msg = Array.isArray(missing) && missing.length > 0
        ? `${base}: ${missing.join(", ")}`
        : base;
      setError(msg);
    } finally {
      setBusy("");
    }
  };

  const close = async () => {
    if (!confirm("Close this pitch? It will no longer appear in the investor feed.")) return;
    setBusy("close"); setError("");
    try {
      await api.post(`/api/pitches/${pitch.id}/close`);
      onRefresh();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy("");
    }
  };

  const remove = async () => {
    if (!confirm("Delete this draft?")) return;
    setBusy("delete"); setError("");
    try {
      await api.delete(`/api/pitches/${pitch.id}`);
      onRefresh();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="p-5 bg-slate-50 border border-slate-200 rounded-lg">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-medium text-slate-900">{pitch.title}</h3>
            <span className={`text-xs px-2 py-0.5 rounded border ${STATUS_COLOR[pitch.status] || STATUS_COLOR.draft}`}>
              {pitch.status}
            </span>
          </div>
          {pitch.tagline && (
            <p className="text-sm text-slate-500 mt-1">{pitch.tagline}</p>
          )}
        </div>
        <div className="flex gap-2">
          {pitch.status === "draft" && (
            <>
              <button
                onClick={() => onEdit(pitch)}
                className="btn-secondary btn-sm"
              >
                Edit
              </button>
              <button
                onClick={publish}
                disabled={busy === "publish"}
                className="btn-primary btn-sm"
              >
                {busy === "publish" ? "Publishing..." : "Publish"}
              </button>
              <button
                onClick={remove}
                disabled={busy === "delete"}
                className="btn-danger btn-sm"
              >
                Delete
              </button>
            </>
          )}
          {pitch.status === "live" && (
            <button
              onClick={close}
              disabled={busy === "close"}
              className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-900 border border-slate-200 rounded-lg disabled:opacity-50"
            >
              {busy === "close" ? "Closing..." : "Close pitch"}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 pt-3 border-t border-slate-200 text-sm sm:grid-cols-3 sm:gap-4">
        <div>
          <div className="text-xs text-slate-400">Ask</div>
          <div className="text-slate-800 font-medium mt-0.5">
            ₹{Number(pitch.askAmount).toLocaleString("en-IN")}
          </div>
        </div>
        <div>
          <div className="text-xs text-slate-400">Equity</div>
          <div className="text-slate-800 font-medium mt-0.5">{pitch.equityOffered}%</div>
        </div>
        <div>
          <div className="text-xs text-slate-400">Valuation</div>
          <div className="text-slate-800 font-medium mt-0.5">
            ₹{Number(pitch.valuation || 0).toLocaleString("en-IN")}
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-3 px-3 py-2 text-xs bg-red-500/10 border border-red-500/30 text-red-600 rounded">
          {error}
        </div>
      )}
    </div>
  );
}

// ─── Pitch create / edit form ──────────────────────────────

function PitchFormModal({ businessId, pitch, onClose, onSuccess }) {
  const isEdit = !!pitch;
 const [form, setForm] = useState({
  title: pitch?.title || "",
  tagline: pitch?.tagline || "",
  shortPitch: pitch?.shortPitch || "",
  longSummary: pitch?.longSummary || "",
  askAmount: pitch?.askAmount || "",
  equityOffered: pitch?.equityOffered || "",
  stage: pitch?.stage || "",
  revenueRange: pitch?.revenueRange || "",
  videoUrl: pitch?.videoUrl || "",
  pitchDeckUrl: pitch?.pitchDeckUrl || "",
});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const update = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const valuation = (() => {
    const ask = Number(form.askAmount);
    const eq = Number(form.equityOffered);
    if (!ask || !eq) return null;
    return Math.round(ask / (eq / 100));
  })();

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload = {
  title: form.title,
  tagline: form.tagline || null,
  shortPitch: form.shortPitch || null,
  longSummary: form.longSummary || null,
  askAmount: Number(form.askAmount),
  equityOffered: Number(form.equityOffered),
  stage: form.stage || null,
  revenueRange: form.revenueRange || null,
  videoUrl: form.videoUrl || null,
  pitchDeckUrl: form.pitchDeckUrl || null,
};

      if (isEdit) {
        await api.patch(`/api/pitches/${pitch.id}`, payload);
      } else {
        await api.post("/api/pitches", { businessId, ...payload });
      }
      onSuccess();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-6"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="w-full max-w-2xl flex flex-col gap-4 p-8 bg-white border border-slate-200 rounded-xl max-h-[90vh] overflow-y-auto"
      >
        <h2 className="text-xl font-semibold text-slate-900">
          {isEdit ? "Edit pitch" : "New pitch"}
        </h2>

        <Field label="Title *">
          <input value={form.title} onChange={update("title")} className={INPUT} required minLength={2} maxLength={255} placeholder="Series A — 2026" />
        </Field>

        <Field label="Tagline">
          <input value={form.tagline} onChange={update("tagline")} className={INPUT} maxLength={300} placeholder="One-sentence summary for cards" />
        </Field>

        <Field label="Short pitch" hint="Required to publish. 2–3 sentences.">
          <textarea value={form.shortPitch} onChange={update("shortPitch")} rows={3} className={INPUT} maxLength={500} placeholder="Incorbiss is a B2B SaaS ERP serving mid-market manufacturers across India and the Middle East..." />
        </Field>

        <Field label="Long summary" hint="Required to publish. Full narrative.">
          <textarea value={form.longSummary} onChange={update("longSummary")} rows={5} className={INPUT} placeholder="Our founding story, the problem we solve, our traction, and how we'll deploy this round..." />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Ask amount (₹) *">
            <input type="number" value={form.askAmount} onChange={update("askAmount")} className={INPUT} required min="1" />
          </Field>
          <Field label="Equity offered (%) *">
            <input type="number" value={form.equityOffered} onChange={update("equityOffered")} className={INPUT} required min="0.1" max="100" step="0.1" />
          </Field>
        </div>
<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
  <Field label="Stage *" hint="What phase is the business in?">
    <select value={form.stage} onChange={update("stage")} className={INPUT} required>
      <option value="">Select...</option>
      <option value="idea">Idea</option>
      <option value="mvp">MVP / Prototype</option>
      <option value="pre_revenue">Pre-revenue</option>
      <option value="early_revenue">Early revenue</option>
      <option value="growth">Growth</option>
      <option value="scale">Scale</option>
    </select>
  </Field>
  <Field label="Revenue range *" hint="Current annual revenue band">
    <select value={form.revenueRange} onChange={update("revenueRange")} className={INPUT} required>
      <option value="">Select...</option>
      <option value="pre_revenue">Pre-revenue</option>
      <option value="under_10L">Under ₹10 lakh</option>
      <option value="10L_1Cr">₹10 lakh – ₹1 Cr</option>
      <option value="1Cr_10Cr">₹1 Cr – ₹10 Cr</option>
      <option value="10Cr_plus">₹10 Cr+</option>
    </select>
  </Field>
</div>

        {valuation && (
          <div className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm">
            <span className="text-slate-500">Implied valuation:</span>{" "}
            <span className="text-slate-800 font-medium">₹{valuation.toLocaleString("en-IN")}</span>
          </div>
        )}

        <Field label="Video URL" hint="Optional — YouTube, Vimeo, etc.">
          <input type="url" value={form.videoUrl} onChange={update("videoUrl")} className={INPUT} placeholder="https://..." />
        </Field>

        <Field label="Pitch deck URL" hint="Optional — Cloudinary, Google Drive, etc.">
          <input type="url" value={form.pitchDeckUrl} onChange={update("pitchDeckUrl")} className={INPUT} placeholder="https://..." />
        </Field>

        {error && (
          <div className="px-3 py-2 text-sm bg-red-500/10 border border-red-500/30 text-red-600 rounded-lg">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? "Saving..." : isEdit ? "Save changes" : "Create draft"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Documents tab — upload + list + apply ───────────────────

function DocumentsTab({ business, businessId }) {
  const qc = useQueryClient();
  const [documentType, setDocumentType] = useState("udyam");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [applying, setApplying] = useState(null);

  const { data: verifications, isLoading } = useQuery({
    queryKey: ["verifications", businessId],
    queryFn: async () => {
      const res = await api.get(`/api/verifications/me?businessId=${businessId}`);
      return res.data.verifications || res.data;
    },
    enabled: !!businessId,
  });

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("file", file);
      const uploadRes = await api.post("/api/uploads", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const { url, publicId } = uploadRes.data?.data ?? {};

      await api.post("/api/verifications", {
        businessId,
        documentType,
        documentUrl: url,
        publicId,
      });

      qc.invalidateQueries({ queryKey: ["verifications", businessId] });
      qc.invalidateQueries({ queryKey: ["business", businessId] });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const applyVerification = async (v) => {
    setApplying(v._id);
    setError("");
    try {
      const res = await api.post(`/api/verifications/${v._id}/apply`, {
        confirmedFields: {},
      });
      const { appliedFields, conflicts } = res.data;

      const parts = [];
      if (appliedFields?.length) parts.push(`Applied ${appliedFields.length} field(s)`);
      if (conflicts?.length) parts.push(`${conflicts.length} conflict(s) kept existing value`);

      alert(parts.join(". ") || "Nothing to apply");

      qc.invalidateQueries({ queryKey: ["verifications", businessId] });
      qc.invalidateQueries({ queryKey: ["business", businessId] });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setApplying(null);
    }
  };

  const STATUS_STYLE = {
    verified: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
    pending: "bg-amber-500/10 text-amber-700 border-amber-500/30",
    needs_review: "bg-amber-500/10 text-amber-700 border-amber-500/30",
    rejected: "bg-red-500/10 text-red-600 border-red-500/30",
  };

  const TYPE_LABEL = {
    udyam: "Udyam Certificate",
    gst: "GST Certificate",
    shop_act: "Shop Act License",
  };

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white divide-y divide-slate-200">
      <section className="p-6 sm:p-7">
        <h2 className="overline mb-4">
          Upload a document
        </h2>

        {error && (
          <div className="mb-4 px-3 py-2 text-xs bg-red-500/10 border border-red-500/30 text-red-600 rounded">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 mb-4">
          <Field label="Document type">
            <select
              value={documentType}
              onChange={(e) => setDocumentType(e.target.value)}
              className={INPUT}
              disabled={uploading}
            >
              <option value="udyam">Udyam Certificate</option>
              <option value="gst">GST Certificate</option>
              <option value="shop_act">Shop Act License</option>
            </select>
          </Field>

          <Field label="File">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={handleFile}
              disabled={uploading}
              className="w-full text-sm text-slate-500 file:mr-3 file:px-3 file:py-2 file:bg-slate-100 file:text-slate-900 file:border-0 file:rounded-lg file:text-sm file:font-medium file:cursor-pointer hover:file:bg-slate-200"
            />
          </Field>
        </div>

        {uploading && (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <span className="w-2 h-2 rounded-full bg-slate-900 animate-pulse" />
            Uploading and running OCR... this takes 3–5 seconds
          </div>
        )}
      </section>

      <section className="p-6 sm:p-7">
        <h2 className="overline mb-4">
          Uploaded documents
        </h2>

        {isLoading && <p className="text-sm text-slate-500">Loading...</p>}

        {!isLoading && (!verifications || verifications.length === 0) && (
          <p className="text-sm text-slate-500">No documents uploaded yet.</p>
        )}

        <div className="space-y-3">
          {verifications?.map((v) => {
            const fields = v.ocrExtractedData
              ? Object.entries(
                  v.ocrExtractedData instanceof Map
                    ? Object.fromEntries(v.ocrExtractedData)
                    : v.ocrExtractedData
                )
              : [];

            return (
              <div key={v._id} className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-800">
                        {TYPE_LABEL[v.documentType] || v.documentType}
                      </span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded border ${
                          STATUS_STYLE[v.status] || STATUS_STYLE.pending
                        }`}
                      >
                        {v.status}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      Uploaded {new Date(v.createdAt).toLocaleDateString()}
                      {v.confidenceScore != null &&
                        ` · Confidence ${Math.round(v.confidenceScore * 100)}%`}
                    </div>
                  </div>

                  {v.status === "verified" && (
                    <button
                      onClick={() => applyVerification(v)}
                      disabled={applying === v._id}
                      className="btn-primary btn-sm whitespace-nowrap"
                    >
                      {applying === v._id ? "Applying..." : "Apply to profile"}
                    </button>
                  )}
                </div>

                {fields.length > 0 && (
                  <div className="pt-3 border-t border-slate-200 space-y-1">
                    {fields.map(([name, field]) => (
                      <div key={name} className="flex items-center justify-between text-xs">
                        <span className="text-slate-500 font-mono">{name}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-slate-700">
                            {field?.value ?? "—"}
                          </span>
                          {field?.formatValid === true && (
                            <span className="text-emerald-700">✓</span>
                          )}
                          {field?.formatValid === false && (
                            <span className="text-red-600" title={field.formatReason}>
                              ✗
                            </span>
                          )}
                          {field?.confidence != null && (
                            <span className="text-slate-400">
                              {Math.round(field.confidence * 100)}%
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {v.errorMessage && (
                  <div className="mt-3 px-3 py-2 text-xs bg-red-500/10 border border-red-500/30 text-red-600 rounded">
                    {v.errorMessage}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="p-6 sm:p-7">
        <h2 className="overline mb-3">
          Verification tier
        </h2>
        <div className="flex items-center gap-3">
          <span className={`text-xs px-2 py-1 rounded border ${
            business.verificationTier === "verified"
              ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/30"
              : business.verificationTier === "basic"
              ? "bg-indigo-50 text-indigo-700 border-indigo-200"
              : "bg-slate-100 text-slate-500 border-slate-300"
          }`}>
            {business.verificationTier || "unverified"}
          </span>
        </div>
        <p className="text-xs text-slate-500 mt-3">
          Tier <strong className="text-slate-500">basic</strong> requires 1+ verified document.
          Tier <strong className="text-slate-500">verified</strong> requires 2+ verified documents
          that agree on the legal entity name. Two documents that disagree stay at basic.
        </p>
      </section>
    </div>
  );
}

// ─── History tab — profile edit audit trail ─────────────────

function HistoryTab({ businessId }) {
  const { data: history, isLoading, error } = useQuery({
    queryKey: ["business-history", businessId],
    queryFn: async () => {
      const res = await api.get(`/api/businesses/${businessId}/history`);
      return res.data.history || res.data.edits || res.data;
    },
    enabled: !!businessId,
  });

  if (isLoading) return <div className="p-8 text-slate-500">Loading...</div>;
  if (error) return <div className="p-8 text-red-600">{getErrorMessage(error)}</div>;
  if (!history || history.length === 0) {
    return (
      <div className="p-6 bg-white border border-slate-200 rounded-xl text-sm text-slate-500">
        No profile edits recorded yet. Any change to your business profile appears here.
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6">
      <h2 className="overline mb-4">
        Profile edit history
      </h2>
      <div className="space-y-3">
        {history.map((edit) => (
          <div
            key={edit.id}
            className="flex items-start gap-4 pb-3 border-b border-slate-200 last:border-0 last:pb-0"
          >
            <div className="w-32 flex-shrink-0 text-xs text-slate-400">
              {new Date(edit.changedAt || edit.changed_at).toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm text-slate-700">
                <span className="font-medium">{edit.fieldName || edit.field_name}</span>{" "}
                changed
              </div>
              <div className="text-xs text-slate-500 mt-1 space-y-0.5">
                {edit.oldValue || edit.old_value ? (
                  <>
                    <div>
                      <span className="text-red-600/70">From:</span>{" "}
                      <span className="line-through text-slate-400">
                        {edit.oldValue || edit.old_value}
                      </span>
                    </div>
                    <div>
                      <span className="text-emerald-700/70">To:</span>{" "}
                      <span className="text-slate-700">
                        {edit.newValue || edit.new_value || "—"}
                      </span>
                    </div>
                  </>
                ) : (
                  <div>
                    <span className="text-emerald-700/70">Set:</span>{" "}
                    <span className="text-slate-700">
                      {edit.newValue || edit.new_value || "—"}
                    </span>
                  </div>
                )}
              </div>
            </div>
            <div className="text-xs text-slate-400">
              {edit.editedById || edit.edited_by_id ? "By user" : "System"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}