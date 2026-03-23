import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
    "../../packages/ui/src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        surface: {
          0: "#0a0b0f",
          1: "#12131a",
          2: "#1a1b25",
          3: "#232430",
          4: "#2c2d3a",
        },
        border: {
          subtle: "#1f2130",
          default: "#2a2b3d",
          strong: "#3a3b50",
        },
        accent: {
          blue: "#4a90d9",
          green: "#34d399",
          amber: "#f59e0b",
          red: "#ef4444",
          cyan: "#22d3ee",
        },
        text: {
          primary: "#e8e9ed",
          secondary: "#9496a8",
          tertiary: "#6b6d80",
          inverse: "#0a0b0f",
        },
      },
      fontFamily: {
        sans: [
          "var(--font-inter)",
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "Consolas", "monospace"],
      },
      fontSize: {
        "2xs": ["0.65rem", { lineHeight: "0.875rem" }],
      },
    },
  },
  plugins: [],
};

export default config;
