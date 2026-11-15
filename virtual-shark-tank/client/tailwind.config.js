/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "rgb(var(--color-primary) / <alpha-value>)",
          fg: "rgb(var(--color-primary-fg) / <alpha-value>)",
        },
        tint: "rgb(var(--color-tint) / <alpha-value>)",
        accent: "rgb(var(--color-accent) / <alpha-value>)",
        surface: "rgb(var(--color-surface) / <alpha-value>)",
        canvas: "rgb(var(--color-bg) / <alpha-value>)",
        hairline: "rgb(var(--color-border) / <alpha-value>)",
        brand: {
          DEFAULT: "#0f172a",
          hover: "#1e293b",
        },
      },
      fontFamily: {
        sans: [
          "var(--font-body)",
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
        heading: [
          "var(--font-heading)",
          "Plus Jakarta Sans",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
      },
      boxShadow: {
        soft: "0 1px 2px rgba(15, 23, 42, 0.04), 0 8px 20px rgba(15, 23, 42, 0.05)",
        "soft-lg": "0 1px 3px rgba(15, 23, 42, 0.05), 0 16px 40px rgba(15, 23, 42, 0.08)",
      },
      keyframes: {
        blob: {
          "0%, 100%": { transform: "translate3d(0, 0, 0) scale(1)" },
          "33%": { transform: "translate3d(20px, -24px, 0) scale(1.04)" },
          "66%": { transform: "translate3d(-16px, 12px, 0) scale(0.97)" },
        },
      },
      animation: {
        blob: "blob 20s ease-in-out infinite",
        "blob-slow": "blob 28s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
