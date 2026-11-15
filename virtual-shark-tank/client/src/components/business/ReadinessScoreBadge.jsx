export default function ReadinessScoreCard({ score, topReasons = [] }) {
  return (
    <div className="card max-w-sm p-6">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
        Readiness Score
      </h3>
      <div className="mt-3 flex items-baseline gap-1">
        <span className="text-4xl font-bold text-slate-900">{score}</span>
        <span className="text-sm text-slate-500">/ 100</span>
      </div>
      <ul className="mt-4 space-y-2">
        {topReasons.map((r) => (
          <li key={r.label} className="text-sm text-slate-700">
            {r.label} —{" "}
            <span className="text-xs text-slate-500">{r.weight} impact</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
