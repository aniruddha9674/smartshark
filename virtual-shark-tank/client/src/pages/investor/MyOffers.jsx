import { Link } from "react-router-dom";
import { useMyOffers } from "../../hooks/useMyOffers";
import { api, getErrorMessage } from "../../lib/api";

const statusColors = {
  pending: "bg-amber-500/10 text-amber-700",
  accepted: "bg-emerald-500/10 text-emerald-700",
  rejected: "bg-red-500/10 text-red-600",
  countered: "bg-indigo-50 text-indigo-700",
  withdrawn: "bg-slate-100 text-slate-500",
  expired: "bg-slate-100 text-slate-500",
};

export default function MyOffers() {
  const { data: offers, isLoading, error, refetch } = useMyOffers();

  const withdraw = async (offerId) => {
    if (!confirm("Withdraw this offer?")) return;
    try {
      await api.post(`/api/offers/${offerId}/withdraw`);
      refetch();
    } catch (err) {
      alert(getErrorMessage(err));
    }
  };

  if (isLoading) return <div className="text-slate-500">Loading...</div>;
  if (error) {
    return (
      <div className="px-4 py-3 bg-red-500/10 border border-red-500/30 text-red-600 rounded-lg">
        {getErrorMessage(error)}
      </div>
    );
  }
  if (!offers || offers.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-slate-500 mb-4">You haven't made any offers yet.</p>
        <Link
          to="/dashboard/feed"
          className="btn-primary"
        >
          Browse feed
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">My offers</h1>
      <div className="joined-grid">
        {offers.map((offer) => (
          <div
            key={offer.id}
            className="joined-cell p-5"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium text-slate-900">
                    {offer.business?.companyName || "Unknown business"}
                  </h3>
                  <span
                    className={`text-xs px-2 py-0.5 rounded ${
                      statusColors[offer.status] || "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {offer.status}
                  </span>
                </div>
                <div className="text-sm text-slate-500 mt-2">
                  ₹{Number(offer.amount).toLocaleString("en-IN")} ·{" "}
                  {offer.equityRequested}% equity
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  Sent {new Date(offer.createdAt).toLocaleDateString()}
                  {offer.expiresAt &&
                    ` · expires ${new Date(offer.expiresAt).toLocaleDateString()}`}
                </div>
              </div>

              <div className="flex gap-2">
                {offer.status === "pending" && (
                  <button
                    onClick={() => withdraw(offer.id)}
                    className="btn-secondary btn-sm"
                  >
                    Withdraw
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}