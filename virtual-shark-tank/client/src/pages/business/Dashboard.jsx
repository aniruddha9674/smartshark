import { useEffect, useState } from "react";
import ReadinessScoreCard from "../../components/business/ReadinessScoreBadge";
import { getReadinessScore } from "../../services/api";

export default function BusinessDashboard() {
  const [scoreData, setScoreData] = useState(null);

  useEffect(() => {
    getReadinessScore().then(setScoreData);
  }, []);

  return (
    <div style={{ padding: "40px" }}>
      <h2 style={{ marginBottom: "24px" }}>Welcome back</h2>
      {scoreData ? (
        <ReadinessScoreCard score={scoreData.score} topReasons={scoreData.topReasons} />
      ) : (
        <p>Loading score...</p>
      )}
    </div>
  );
}