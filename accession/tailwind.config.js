/** ACCESSION — design tokens for the SGU Archive.
 *  Museum / observatory / scientific-institution palette. No gradients, no glass.
 */
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0C0F16", // observatory ground
        plate: "#0A0D13", // darker plate emulsion
        slate: "#141A26", // raised surface
        bone: "#E9E3D5", // primary text — archival paper as ink-on-dark
        "bone-dim": "#CBC6BA",
        graphite: "#8C93A1", // secondary text
        verdigris: "#5FB6A6", // the single living accent — patinated brass
        brass: "#B6924F", // gilt hairline, rare emphasis
        oxblood: "#B0524C", // semantic only — "fiction", corrections
        rule: "#222A38", // hairlines, graticule
      },
      fontFamily: {
        serif: ['"Spectral"', "Georgia", "serif"],
        mono: ['"IBM Plex Mono"', "ui-monospace", "monospace"],
        sans: ['"IBM Plex Sans"', "system-ui", "sans-serif"],
      },
      letterSpacing: {
        label: "0.14em",
        wide: "0.18em",
      },
      maxWidth: {
        measure: "1040px",
        column: "760px",
      },
      transitionTimingFunction: {
        archival: "cubic-bezier(0.2, 0.7, 0.2, 1)",
      },
      keyframes: {
        settle: {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        drawX: {
          "0%": { transform: "scaleX(0)" },
          "100%": { transform: "scaleX(1)" },
        },
        pulse: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.35" },
        },
      },
      animation: {
        settle: "settle 0.7s cubic-bezier(0.2,0.7,0.2,1) both",
        drawX: "drawX 0.6s cubic-bezier(0.2,0.7,0.2,1) both",
        pulse: "pulse 2.6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
