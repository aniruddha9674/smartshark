const TIER_INFO = {
  unverified: {
    label: "Unverified",
    color: "bg-zinc-800 text-zinc-400 border-zinc-700",
    description: "Upload a document to earn the Basic badge",
    next: "basic",
  },
  basic: {
    label: "Basic — Verified",
    color: "bg-blue-500/10 text-blue-400 border-blue-500/30",
    description: "Upload a second document to reach Verified",
    next: "verified",
  },
  verified: {
    label: "Verified",
    color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    description: "Two documents agree on your company name. You're fully verified.",
    next: null,
  },
};

const NEXT_STEPS = {
  basic: [
    "Upload a GST certificate or Shop Act license",
    "Confirm the extracted fields match your business details",
    "Apply the document to your profile",
  ],
  verified: [
    "Get a second document (GST + Udyam work best together)",
    "Make sure both documents list the same company name",
    "Apply both — the tier upgrades automatically",
  ],
};

export default function VerificationStatus({ business, verifications }) {
  const tier = business.verificationTier || "unverified";
  const info = TIER_INFO[tier] || TIER_INFO.unverified;

  const verifiedCount = (verifications || []).filter(
    (v) => v.status === "verified"
  ).length;
  const pendingCount = (verifications || []).filter(
    (v) => v.status === "pending" || v.status === "needs_review"
  ).length;

  return (
    <div className={`p-5 border rounded-xl ${info.color}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-wider opacity-70">
              Verification tier
            </span>
          </div>
          <div className="text-xl font-semibold mt-1">{info.label}</div>
          <div className="text-sm opacity-80 mt-1">{info.description}</div>
        </div>
        <div className="text-right text-sm">
          <div>{verifiedCount} verified</div>
          {pendingCount > 0 && (
            <div className="opacity-70">{pendingCount} pending review</div>
          )}
        </div>
      </div>

      {info.next && (
        <details className="mt-4 group">
          <summary className="text-sm cursor-pointer hover:opacity-80">
            What do I do next?
          </summary>
          <ol className="mt-3 space-y-1.5 text-sm list-decimal list-inside opacity-90">
            {(NEXT_STEPS[info.next] || []).map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}