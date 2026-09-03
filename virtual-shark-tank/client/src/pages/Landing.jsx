import { Link } from "react-router-dom";

export default function Landing() {
  return (
    <div>
      <nav style={styles.nav}>
        <span style={styles.logo}>VyaparSetu</span>
      </nav>
      <section style={styles.hero}>
        <h1 style={styles.title}>Connecting local businesses to real investors.</h1>
        <p style={styles.subtitle}>
          A verified, explainable platform built for Maharashtra's small businesses.
        </p>
        <Link to="/business/dashboard" style={styles.cta}>Get Started</Link>
      </section>
    </div>
  );
}

const styles = {
  nav: { padding: "16px 40px", borderBottom: "1px solid var(--color-border)", background: "#fff" },
  logo: { fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "1.25rem", color: "var(--color-primary)" },
  hero: { textAlign: "center", padding: "40px 24px", maxWidth: "640px", margin: "0 auto" },
  title: { fontSize: "2.25rem", marginBottom: "16px", color: "var(--color-primary)" },
  subtitle: { color: "var(--color-text-muted)", marginBottom: "24px" },
  cta: { display: "inline-block", background: "var(--color-primary)", color: "#fff", padding: "12px 28px", borderRadius: "10px", textDecoration: "none", fontWeight: 600 },
};