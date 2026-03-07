import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        "ai-error": "#EF4444",
        "ai-hint": "#3B82F6",
        "ai-praise": "#22C55E",
      },
    },
  },
  plugins: [],
};

export default config;
