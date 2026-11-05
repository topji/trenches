import type { Config } from "tailwindcss";

/** Every colour maps to a CSS variable defined in app/globals.css. No raw hex in components. */
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    screens: { sm: "640px", lg: "1024px" },
    colors: {
      transparent: "transparent",
      current: "currentColor",
      bg: "var(--bg)",
      raised: "var(--bg-raised)",
      sunken: "var(--bg-sunken)",
      line: "var(--line)",
      text: "var(--text)",
      muted: "var(--text-muted)",
      faint: "var(--text-faint)",
      accent: "var(--accent)",
      "accent-ink": "var(--accent-ink)",
      gain: "var(--gain)",
      loss: "var(--loss)",
      warn: "var(--warn)",
      "rank-2": "var(--rank-2)",
      "rank-3": "var(--rank-3)",
    },
    spacing: {
      0: "0px", px: "1px", 1: "4px", 2: "8px", 3: "12px", 4: "16px", 6: "24px", 8: "32px", 12: "48px", 16: "64px",
      // control heights
      10: "40px", 11: "44px", 14: "56px",
    },
    borderRadius: { none: "0", DEFAULT: "6px", panel: "10px", pill: "999px" },
    boxShadow: { none: "none" },
    extend: {
      fontFamily: {
        sans: ["var(--font-archivo)", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      maxWidth: { content: "1080px" },
      transitionDuration: { 240: "240ms" },
    },
  },
  plugins: [],
};

export default config;
