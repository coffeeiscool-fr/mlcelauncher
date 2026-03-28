/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        panel: "#171717",
        panelLight: "#202020",
        accent: "#93a0ff",
        textSoft: "#cfd3df",
        greenPrimary: "#2a5a3a",
        greenPrimaryHover: "#1f4d2f",
        greenSecondary: "#3a4a3a",
        greenSecondaryHover: "#2f3d2f"
      }
    }
  },
  plugins: []
};
