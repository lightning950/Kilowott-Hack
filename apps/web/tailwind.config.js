/** @type {import('tailwindcss').Config} */
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: token("bg"),
        surface: token("surface"),
        subtle: token("subtle"),
        border: token("border"),
        "border-strong": token("border-strong"),
        fg: token("fg"),
        muted: token("muted"),
        faint: token("faint"),
        accent: { DEFAULT: token("accent"), fg: token("accent-fg"), tint: token("accent-tint") },
        ok: { DEFAULT: token("ok"), tint: token("ok-tint") },
        warn: { DEFAULT: token("warn"), tint: token("warn-tint") },
        bad: { DEFAULT: token("bad"), tint: token("bad-tint") },
        info: { DEFAULT: token("info"), tint: token("info-tint") },
      },
      fontFamily: {
        sans: ['"Geist"', "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ['"Geist Mono"', "ui-monospace", "SFMono-Regular", "monospace"],
      },
      fontSize: {
        "2xs": ["11px", "16px"],
        xs: ["12px", "16px"],
        sm: ["13px", "20px"],
        base: ["14px", "22px"],
        md: ["16px", "24px"],
        lg: ["20px", "28px"],
        xl: ["24px", "32px"],
      },
      borderRadius: { DEFAULT: "6px", md: "6px", lg: "8px" },
      boxShadow: {
        overlay: "0 12px 32px -8px rgb(0 0 0 / 0.18), 0 2px 6px rgb(0 0 0 / 0.06)",
      },
      transitionDuration: { DEFAULT: "150ms" },
      keyframes: {
        "pulse-dot": { "0%,100%": { opacity: "1" }, "50%": { opacity: "0.35" } },
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "slide-in": { from: { transform: "translateX(16px)", opacity: "0" }, to: { transform: "none", opacity: "1" } },
        "pop-in": { from: { transform: "translateY(4px) scale(0.98)", opacity: "0" }, to: { transform: "none", opacity: "1" } },
      },
      animation: {
        "pulse-dot": "pulse-dot 1.2s ease-in-out infinite",
        "fade-in": "fade-in 150ms ease-out",
        "slide-in": "slide-in 180ms ease-out",
        "pop-in": "pop-in 150ms ease-out",
      },
    },
  },
  plugins: [],
};
