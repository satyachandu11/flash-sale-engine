/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        hull: "#06101b",
        ink: "#03070d",
        cyan: "#67e8f9",
        plasma: "#4ade80",
        ember: "#f59e0b",
        alarm: "#fb7185",
        chrome: "#cad6e8"
      },
      fontFamily: {
        sans: ["Satoshi", "\"Space Grotesk\"", "sans-serif"],
        serif: ["\"Instrument Serif\"", "serif"]
      },
      boxShadow: {
        cockpit: "0 30px 80px rgba(2, 8, 18, 0.55)"
      },
      backgroundImage: {
        stars:
          "radial-gradient(circle at 20% 20%, rgba(103, 232, 249, 0.16), transparent 24%), radial-gradient(circle at 80% 0%, rgba(59, 130, 246, 0.18), transparent 28%), linear-gradient(180deg, #020712 0%, #08111c 60%, #03070d 100%)"
      }
    }
  },
  plugins: []
};
