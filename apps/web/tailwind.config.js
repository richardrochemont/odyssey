/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#F7F7F5", // warm off-white
        foreground: "#101010", // near-black
        primary: {
          DEFAULT: "#101010",
          foreground: "#ffffff",
        },
        secondary: {
          DEFAULT: "#525252", // graphite gray
          foreground: "#ffffff",
        },
        accent: {
          DEFAULT: "#101010",
          foreground: "#ffffff",
        },
        card: {
          DEFAULT: "#ffffff",
          foreground: "#101010",
        },
        border: "#e5e5e5",
        muted: {
          DEFAULT: "#737373",
          foreground: "#737373",
        },
        danger: {
          DEFAULT: "#800f2f", // restrained burgundy
          foreground: "#ffffff",
        },
        warning: {
          DEFAULT: "#800f2f", // restrained burgundy
          foreground: "#ffffff",
        },
        success: {
          DEFAULT: "#101010",
          foreground: "#ffffff",
        }
      },
      fontFamily: {
        sans: ["Plus Jakarta Sans", "Inter", "sans-serif"],
        serif: ["Playfair Display", "Lora", "serif"],
      },
    },
  },
  plugins: [],
}
