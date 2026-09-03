export const getReadinessScore = async () => {
  return {
    score: 72,
    topReasons: [
      { label: "GST filing regularity", weight: "high" },
      { label: "Digital footprint", weight: "medium" },
    ],
  };
};