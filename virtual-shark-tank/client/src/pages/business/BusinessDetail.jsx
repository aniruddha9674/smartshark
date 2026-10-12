import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useBusiness } from "../../hooks/useMyBusinesses";
import {
  useVerifications,
  useCreateVerification,
  useApplyVerification,
} from "../../hooks/useVerifications";
import { api, getErrorMessage } from "../../lib/api";
import { useQueryClient } from "@tanstack/react-query";
import VerificationStatus from "../../components/VerificationStatus";

const inputClass =
  "px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 outline-none focus:border-brand w-full text-sm";

const DOC_TYPES = [
  { value: "udyam", label: "Udyam Registration" },
  { value: "gst", label: "GST Certificate" },
  { value: "shop_act", label: "Shop Act License" },
];

const statusColors = {
  pending: "bg-amber-500/10 text-amber-400",
  verified: "bg-emerald-500/10 text-emerald-400",
  needs_review: "bg-blue-500/10 text-blue-400",
  rejected: "bg-red-500/10 text-red-400",
};

export default function BusinessDetail() {
  const { businessId } = useParams();
  const [tab, setTab] = useState("profile");

  const { data: business, isLoading, error } = useBusiness(businessId);

  if (isLoading) return <div className="text-zinc-500">Loading...</div>;
  if (error) {
    return (
      <div className="px-4 py-3 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg">
        {getErrorMessage(error)}
      </div>
    );
  }
  if (!business) return <div className="text-zinc-500">Not found</div>;

  return (
    <div className="max-w-3xl">
      <Link
        to="/dashboard/businesses"
        className="text-sm text-zinc-500 hover:text-zinc-300 mb-4 inline-block"
      >
        ← Back to businesses
      </Link>

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">{business.companyName}</h1>
        <span
          className={`text-xs px-2 py-1 rounded ${
            statusColors[business.verificationTier] ||
            "bg-zinc-800 text-zinc-500"
          }`}
        >
          {business.verificationTier}
        </span>
      </div>

      <div className="flex gap-2 mb-6 border-b border-zinc-800">
        <TabButton active={tab === "profile"} onClick={() => setTab("profile")}>
          Profile
        </TabButton>
        <TabButton active={tab === "documents"} onClick={() => setTab("documents")}>
          Documents
        </TabButton>
        <TabButton active={tab === "history"} onClick={() => setTab("history")}>
          History
        </TabButton>
      </div>

      {tab === "profile" && <ProfileTab business={business} />}
      {tab === "documents" && <DocumentsTab business={business} />}
      {tab === "history" && <HistoryTab business={business} />}
    </div>
  );
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm -mb-px border-b-2 transition-colors ${
        active
          ? "border-brand text-zinc-100"
          : "border-transparent text-zinc-500 hover:text-zinc-300"
      }`}
    >
      {children}
    </button>
  );
}

function ProfileTab({ business }) {
  const [form, setForm] = useState({
    companyName: business.companyName || "",
    sector: business.sector || "",
    city: business.city || "",
    description: business.description || "",
    fundingAsk: business.fundingAsk ? String(business.fundingAsk) : "",
    yearsOperating: business.yearsOperating ? String(business.yearsOperating) : "",
    websiteUrl: business.websiteUrl || "",
    udyamNumber: business.udyamNumber || "",
    gstNumber: business.gstNumber || "",
    shopActLicense: business.shopActLicense || "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const update = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const save = async (e) => {
    e.preventDefault();
    setError("");
    setSaving(true);
    setSaved(false);
    try {
      const patch = {};
      for (const [k, v] of Object.entries(form)) {
        if (v === "") continue;
        if (["fundingAsk", "yearsOperating"].includes(k)) {
          patch[k] = Number(v);
        } else {
          patch[k] = v;
        }
      }
      await api.patch(`/api/businesses/${business.id}`, patch);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="space-y-3">
      <Field label="Company name *">
        <input value={form.companyName} onChange={update("companyName")} className={inputClass} required />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Sector">
          <input value={form.sector} onChange={update("sector")} className={inputClass} />
        </Field>
        <Field label="City">
          <input value={form.city} onChange={update("city")} className={inputClass} />
        </Field>
      </div>
      <Field label="Description">
        <textarea value={form.description} onChange={update("description")} rows={3} className={inputClass} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Funding ask (₹)">
          <input type="number" value={form.fundingAsk} onChange={update("fundingAsk")} className={inputClass} />
        </Field>
        <Field label="Years operating">
          <input type="number" value={form.yearsOperating} onChange={update("yearsOperating")} className={inputClass} />
        </Field>
      </div>
      <Field label="Website">
        <input value={form.websiteUrl} onChange={update("websiteUrl")} className={inputClass} />
      </Field>

      <div className="pt-4 border-t border-zinc-800">
        <h3 className="text-sm font-medium text-zinc-400 mb-3">
          Registration numbers (optional — verified through document upload)
        </h3>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Udyam">
            <input value={form.udyamNumber} onChange={update("udyamNumber")} className={inputClass} />
          </Field>
          <Field label="GSTIN">
            <input value={form.gstNumber} onChange={update("gstNumber")} className={inputClass} />
          </Field>
          <Field label="Shop Act">
            <input value={form.shopActLicense} onChange={update("shopActLicense")} className={inputClass} />
          </Field>
        </div>
      </div>

      {error && (
        <div className="px-3 py-2 text-sm bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg">
          {error}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 bg-brand hover:bg-brand-hover rounded-lg text-sm font-medium disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save changes"}
        </button>
        {saved && <span className="text-sm text-emerald-400">Saved</span>}
      </div>
    </form>
  );
}

function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm text-zinc-400">
      {label}
      {children}
    </label>
  );
}

function DocumentsTab({ business }) {
  const queryClient = useQueryClient();
  const { data: verifications, isLoading } = useVerifications(business.id);
  const create = useCreateVerification(business.id);

  const [documentType, setDocumentType] = useState("udyam");
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [applying, setApplying] = useState(null);

  const upload = async (e) => {
    e.preventDefault();
    if (!file) return;
    setError("");
    setSuccessMsg("");
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const uploadRes = await api.post("/api/uploads", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const { url, publicId } = uploadRes.data.data;

      const result = await create.mutateAsync({
        businessId: business.id,
        documentType,
        documentUrl: url,
        publicId,
      });

      setFile(null);
      e.target.reset();

      const status = result.data?.verification?.status;
      if (status === "verified") {
        setSuccessMsg(
          "Document verified. Click 'Apply to profile' below to merge the extracted fields and earn your badge."
        );
      } else if (status === "needs_review") {
        setSuccessMsg(
          "Document extracted with low confidence. An admin will review it."
        );
      } else {
        setSuccessMsg("Uploaded. Processing...");
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setUploading(false);
    }
  };

  const applyVerification = async (v) => {
    setApplying(v._id);
    setError("");
    try {
      const res = await api.post(`/api/verifications/${v._id}/apply`, {
        confirmedFields: {},
      });

      const { newTier, appliedFields, conflicts } = res.data;

      // Refetch everything relevant
      queryClient.invalidateQueries({ queryKey: ["verifications", business.id] });
      queryClient.invalidateQueries({ queryKey: ["business", business.id] });
      queryClient.invalidateQueries({ queryKey: ["my-businesses"] });

      let msg = `Applied ${appliedFields.length} field(s).`;
      if (newTier !== business.verificationTier) {
        msg += ` Tier upgraded to ${newTier}.`;
      }
      if (conflicts && conflicts.length > 0) {
        msg += ` ${conflicts.length} field(s) had conflicting values and were not overwritten.`;
      }
      setSuccessMsg(msg);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setApplying(null);
    }
  };

  return (
    <div className="space-y-6">
      <VerificationStatus business={business} verifications={verifications} />

      <form
        onSubmit={upload}
        className="p-5 bg-zinc-900 border border-zinc-800 rounded-xl space-y-3"
      >
        <h3 className="text-sm font-medium text-zinc-300">Upload a document</h3>
        <div className="grid grid-cols-3 gap-3">
          <label className="flex flex-col gap-1.5 text-sm text-zinc-400">
            Type
            <select
              value={documentType}
              onChange={(e) => setDocumentType(e.target.value)}
              className={inputClass}
            >
              {DOC_TYPES.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm text-zinc-400 col-span-2">
            File (JPEG, PNG, WebP, PDF · max 10 MB)
            <input
              type="file"
              accept="image/*,.pdf"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className={inputClass}
            />
          </label>
        </div>

        {error && (
          <div className="px-3 py-2 text-sm bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg">
            {error}
          </div>
        )}

        {successMsg && (
          <div className="px-3 py-2 text-sm bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-lg">
            {successMsg}
          </div>
        )}

        <button
          type="submit"
          disabled={!file || uploading}
          className="px-4 py-2 bg-brand hover:bg-brand-hover rounded-lg text-sm font-medium disabled:opacity-50"
        >
          {uploading ? "Uploading & extracting..." : "Upload"}
        </button>
      </form>

      <div>
        <h3 className="text-sm font-medium text-zinc-400 mb-3">Your documents</h3>
        {isLoading && <div className="text-zinc-500 text-sm">Loading...</div>}
        {verifications?.length === 0 && (
          <div className="p-5 bg-zinc-900 border border-zinc-800 rounded-xl text-sm text-zinc-500">
            No documents uploaded yet.
          </div>
        )}
        <div className="space-y-2">
          {verifications?.map((v) => (
            <div
              key={v._id}
              className="p-4 bg-zinc-900 border border-zinc-800 rounded-xl"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-zinc-100 capitalize">
                      {v.documentType.replace("_", " ")}
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded ${
                        statusColors[v.status] || "bg-zinc-800 text-zinc-500"
                      }`}
                    >
                      {v.status}
                    </span>
                  </div>
                  <div className="text-xs text-zinc-500 mt-1">
                    Confidence: {((v.confidenceScore || 0) * 100).toFixed(0)}%
                    {v.errorMessage && ` · ${v.errorMessage}`}
                  </div>
                  <div className="text-xs text-zinc-600 mt-1">
                    {new Date(v.createdAt).toLocaleString()}
                  </div>
                </div>

                {v.status === "verified" && (
                  <button
                    onClick={() => applyVerification(v)}
                    disabled={applying === v._id}
                    className="px-3 py-1.5 text-sm bg-brand hover:bg-brand-hover rounded-lg disabled:opacity-50 whitespace-nowrap"
                  >
                    {applying === v._id ? "Applying..." : "Apply to profile"}
                  </button>
                )}
              </div>

              {v.ocrExtractedData && Object.keys(v.ocrExtractedData).length > 0 && (
                <details className="mt-3">
                  <summary className="text-xs text-zinc-500 cursor-pointer hover:text-zinc-300">
                    View extracted fields
                  </summary>
                  <div className="mt-2 text-xs bg-zinc-950 border border-zinc-800 rounded p-3 space-y-1">
                    {Object.entries(v.ocrExtractedData).map(([k, val]) => (
                      <div key={k} className="flex justify-between gap-3">
                        <span className="text-zinc-500">{k}</span>
                        <span className="text-zinc-300 text-right truncate">
                          {val.value ?? "—"}{" "}
                          <span className="text-zinc-600">
                            ({((val.confidence || 0) * 100).toFixed(0)}%)
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function HistoryTab({ business }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useState(() => {
    api
      .get(`/api/businesses/${business.id}/history`)
      .then((res) => setHistory(res.data.history || res.data.edits || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  });

  if (loading) return <div className="text-zinc-500 text-sm">Loading...</div>;
  if (history.length === 0) {
    return <div className="text-zinc-500 text-sm">No edits yet.</div>;
  }

  return (
    <div className="space-y-2">
      {history.map((h) => (
        <div
          key={h.id}
          className="p-3 bg-zinc-900 border border-zinc-800 rounded-lg text-sm"
        >
          <div className="flex items-center justify-between">
            <span className="text-zinc-300 font-medium">{h.fieldName}</span>
            <span className="text-xs text-zinc-600">
              {new Date(h.changedAt).toLocaleString()}
            </span>
          </div>
          <div className="text-xs text-zinc-500 mt-1">
            <span className="line-through">{h.oldValue || "—"}</span>
            {" → "}
            <span className="text-zinc-300">{h.newValue}</span>
          </div>
        </div>
      ))}
    </div>
  );
}