import { Link, useNavigate } from "react-router-dom";
import { Building2, Plus } from "lucide-react";
import { useMyBusinesses } from "../../hooks/useMyBusinesses";
import { getErrorMessage } from "../../lib/api";

const tierColors = {
  unverified: "bg-slate-100 text-slate-600 border border-slate-200",
  basic: "bg-blue-50 text-blue-700 border border-blue-100",
  verified: "bg-emerald-50 text-emerald-700 border border-emerald-100",
};

const tierSymbol = {
  unverified: "○",
  basic: "◐",
  verified: "✓",
};

export default function MyBusinesses() {
  const { data: businesses, isLoading, error } = useMyBusinesses();

  if (isLoading) return <div className="text-sm text-slate-500">Loading...</div>;
  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {getErrorMessage(error)}
      </div>
    );
  }

  if (!businesses || businesses.length === 0) {
    return (
      <div className="card flex flex-col items-center px-6 py-16 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
          <Building2 className="h-5 w-5" />
        </div>
        <p className="mt-4 text-sm text-slate-600">
          You haven't created a business yet.
        </p>
        <Link to="/onboarding/business" className="btn-primary mt-5">
          <Plus className="h-4 w-4" />
          Create a business
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            My Businesses
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Manage your profiles, documents, and pitches.
          </p>
        </div>
        <Link to="/onboarding/business" className="btn-primary">
          <Plus className="h-4 w-4" />
          Add Business
        </Link>
      </div>

      <div className="joined-grid sm:grid-cols-2 xl:grid-cols-3">
        {businesses.map((b) => (
          <BusinessCard key={b.id} business={b} />
        ))}
      </div>
    </div>
  );
}

function BusinessCard({ business: b }) {
  const navigate = useNavigate();

  const initials = (b.companyName || "?")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const tier = b.verificationTier || "unverified";
  const isComplete = b.isProfileComplete === true;

  const openWizard = () => {
    navigate(`/dashboard/businesses/${b.id}`);
  };

  return (
    <div className="joined-cell flex flex-col p-5">
      <Link to={`/dashboard/businesses/${b.id}`} className="block">
        <div className="flex items-start gap-4">
          {b.logoUrl ? (
            <img
              src={b.logoUrl}
              alt={b.companyName}
              className="h-12 w-12 flex-shrink-0 rounded-lg border border-slate-200 bg-white object-contain p-1"
            />
          ) : (
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-tint text-sm font-semibold text-slate-900">
              {initials}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-semibold text-slate-900">
              {b.companyName}
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              {b.sector || "—"} {b.city ? `· ${b.city}` : ""}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  tierColors[tier] || tierColors.unverified
                }`}
              >
                <span>{tierSymbol[tier]}</span>
                {tier}
              </span>
              {!isComplete && (
                <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                  Draft
                </span>
              )}
            </div>
          </div>
        </div>
      </Link>

      <div className="mt-4 border-t border-slate-200 pt-4">
        <button
          onClick={openWizard}
          className="btn-primary w-full"
        >
          {isComplete ? "Edit profile" : "Complete profile"}
        </button>
      </div>
    </div>
  );
}
