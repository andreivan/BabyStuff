import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        oatmeal: {
          50: "#fbf7ee",
          100: "#f2eadb",
          200: "#e5d7be",
          300: "#d4bd9a",
        },
        sage: {
          100: "#dde4d6",
          200: "#c5d0bb",
          300: "#9faf92",
          500: "#69785f",
        },
        charcoal: {
          500: "#4f4941",
          700: "#342f2a",
          900: "#201d19",
        },
        clay: "#b7846f",
        rice: "#fffdf7",
      },
      boxShadow: {
        soft: "0 18px 45px rgba(52, 47, 42, 0.09)",
        card: "0 10px 30px rgba(52, 47, 42, 0.08)",
      },
      borderRadius: {
        imperfect: "28px 22px 30px 20px",
      },
      fontFamily: {
        display: ["Georgia", "Cambria", "Times New Roman", "serif"],
        body: ["var(--font-body)", "ui-serif", "Georgia", "serif"],
      },
      keyframes: {
        rise: {
          "0%": { opacity: "0", transform: "translateY(12px) scale(0.98)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        breathe: {
          "0%, 100%": { transform: "translate3d(0, 0, 0) scale(1)" },
          "50%": { transform: "translate3d(4px, -6px, 0) scale(1.02)" },
        },
      },
      animation: {
        rise: "rise 420ms ease-out both",
        breathe: "breathe 7s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
