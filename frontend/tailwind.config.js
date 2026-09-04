/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html","./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        hairline: "#e5e5e5",
        muted: "#737373",
      },
      fontFamily: { sans: ["Inter","system-ui","sans-serif"], mono: ["JetBrains Mono","ui-monospace","monospace"] }
    }
  },
  plugins: []
}
