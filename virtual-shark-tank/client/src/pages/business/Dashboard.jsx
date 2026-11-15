import { useEffect, useState } from "react";
import ReadinessScoreCard from "../../components/business/ReadinessScoreBadge";
import { getReadinessScore } from "../../services/api";

export default function BusinessDashboard() {
  const [scoreData, setScoreData] = useState(null);

  useEffect(() => {
    getReadinessScore().then(setScoreData);
  }, []);

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <h2 className="text-2xl font-bold tracking-tight text-slate-900">
        Welcome back
      </h2>
      <p className="mt-1 text-sm text-slate-600">
        Here's how your business profile is doing.
      </p>

      <div className="mt-6">
        {scoreData ? (
          <ReadinessScoreCard
            score={scoreData.score}
            topReasons={scoreData.topReasons}
          />
        ) : (
          <div className="card max-w-sm p-6 text-sm text-slate-500">
            Loading score...
          </div>
        )}
      </div>
    </div>
  );
}
