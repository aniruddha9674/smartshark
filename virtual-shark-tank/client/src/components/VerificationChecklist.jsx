import { useVerifications } from "../hooks/useVerifications";

export default function VerificationChecklist({ business }) {
  const { data: verifications } = useVerifications(business.id);

  const hasVerified = (type) =>
    (verifications || []).some(
      (v) => v.documentType === type && v.status === "verified"
    );

  const hasUploaded = (type) =>
    (verifications || []).some((v) => v.documentType === type);

  const items = [
    {
      label: "Udyam certificate",
      done: hasVerified("udyam"),
      uploaded: hasUploaded("udyam"),
    },
    {
      label: "GST certificate",
      done: hasVerified("gst"),
      uploaded: hasUploaded("gst"),
    },
    {
      label: "Shop Act license",
      done: hasVerified("shop_act"),
      uploaded: hasUploaded("shop_act"),
    },
  ];

  const completed = items.filter((i) => i.done).length;

  // Tier 100% requires 2 of 3 verified docs. Adjust if your rule differs.
  const target = 2;

  return (
    <div className="mb-6 p-4 bg-zinc-900 border border-zinc-800 rounded-xl">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-zinc-300">
          Verification progress
        </span>
        <span className="text-sm text-zinc-500">
          {completed} / {target} verified
        </span>
      </div>

      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.label} className="flex items-center gap-3 text-sm">
            <span
              className={`w-5 h-5 flex items-center justify-center rounded-full flex-shrink-0 text-xs ${
                item.done
                  ? "bg-emerald-500/20 text-emerald-400"
                  : item.uploaded
                  ? "bg-amber-500/20 text-amber-400"
                  : "bg-zinc-800 text-zinc-600"
              }`}
            >
              {item.done ? "✓" : item.uploaded ? "…" : "·"}
            </span>
            <span className={item.done ? "text-zinc-300" : "text-zinc-500"}>
              {item.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}