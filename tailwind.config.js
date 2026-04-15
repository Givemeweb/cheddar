/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        cheddar: {
          yellow: "#FFB800",
          dark: "#212226",
          gray: "#6B7280",
          light: "#F9FAFB",
          income: "#10B981",
          expense: "#EF4444",
        },
      },
    },
  },
  plugins: [],
};
