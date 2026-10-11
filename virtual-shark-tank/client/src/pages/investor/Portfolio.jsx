import { usePortfolio } from "../../hooks/usePortfolio";
import { getErrorMessage } from "../../lib/api";

export default function Portfolio() {
  const { data: investments, isLoading, error } = usePortfolio();

  if (isLoading) return <div className="text-zinc-500">Loading...</div>;
  if (error) {
    return (
      <div className="px-4 py-3 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg">
        {getErrorMessage(error)}
      </div>
    );
  }
  if (!investments || investments.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-zinc-500">No investments yet.</p>
      </div>
    );
  }

  const totalInvested = investments.reduce(
    (sum, i) => sum + Number(i.amount || 0),
    0
  );

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Portfolio</h1>

      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="p-5 bg-zinc-900 border border-zinc-800 rounded-xl">
          <div className="text-xs text-zinc-500 uppercase tracking-wider">
            Total invested
          </div>
          <div className="text-2xl font-semibold mt-2">
            ₹{totalInvested.toLocaleString("en-IN")}
          </div>
        </div>
        <div className="p-5 bg-zinc-900 border border-zinc-800 rounded-xl">
          <div className="text-xs text-zinc-500 uppercase tracking-wider">
            Investments
          </div>
          <div className="text-2xl font-semibold mt-2">{investments.length}</div>
        </div>
      </div>

      <div className="space-y-3">
        {investments.map((inv) => (
          <div
            key={inv.id}
            className="p-5 bg-zinc-900 border border-zinc-800 rounded-xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-medium text-zinc-100">
                  {inv.business?.companyName || "Unknown business"}
                </h3>
                <div className="text-sm text-zinc-500 mt-2">
                  ₹{Number(inv.amount).toLocaleString("en-IN")} for{" "}
                  {inv.equityTaken}% equity
                </div>
                <div className="text-xs text-zinc-600 mt-1">
                  Invested {new Date(inv.investedAt).toLocaleDateString()}
                </div>
              </div>
              <span className="text-xs px-2 py-0.5 bg-emerald-500/10 text-emerald-400 rounded">
                {inv.status}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}