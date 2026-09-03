export default function ReadinessScoreCard({ score, topReasons }) {
  return (
    <div style={styles.card}>
      <h3 style={styles.heading}>Readiness Score</h3>
      <div style={styles.scoreRow}>
        <span style={styles.scoreNumber}>{score}</span>
        <span style={styles.scoreOutOf}>/ 100</span>
      </div>
      <ul style={styles.reasonList}>
        {topReasons.map((r) => (
          <li key={r.label} style={styles.reasonItem}>
            {r.label} — <span style={styles.weight}>{r.weight} impact</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const styles = {
  card: { background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "10px", padding: "24px", maxWidth: "360px" },
  heading: { marginBottom: "8px", color: "var(--color-primary)" },
  scoreRow: { display: "flex", alignItems: "baseline", gap: "4px", marginBottom: "16px" },
  scoreNumber: { fontSize: "2.5rem", fontWeight: 700, color: "var(--color-primary)" },
  scoreOutOf: { color: "var(--color-text-muted)" },
  reasonList: { listStyle: "none", display: "flex", flexDirection: "column", gap: "6px" },
  reasonItem: { fontSize: "0.9rem" },
  weight: { color: "var(--color-text-muted)", fontSize: "0.85rem" },
};