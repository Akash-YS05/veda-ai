import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        orange: "#ff5623",
        ink: "#303030",
        muted: "#707070",
        cream: "#f4f4f2",
        green: "#31bd1b",
      },
      keyframes: {
        pulse: {
          "50%": { transform: "scale(1.06)", opacity: "0.45" },
        },
        loading: {
          to: { width: "100%" },
        },
      },
      animation: {
        "pulse-ring": "pulse 1.2s infinite",
        "pulse-ring-b": "pulse 1.2s 0.3s infinite",
        loading: "loading 2.3s ease-in-out forwards",
      },
      fontFamily: {
        bricolage: ["Bricolage Grotesque", "sans-serif"],
        patrick: ["Patrick Hand", "cursive"],
      },
    },
  },
  plugins: [],
};

export default config;
