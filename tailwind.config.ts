import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class", '[data-theme="dark"]'],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        /* Every colour resolves through a CSS variable defined in
           globals.css, so a theme switch is a variable swap rather than a
           second set of `dark:` utilities. Channels are space-separated RGB
           so `<alpha-value>` still works: `bg-surface-card/50` is valid. */

        /* ── Ground ── */
        base: "rgb(var(--base) / <alpha-value>)",

        /* ── Surface ladder, lowest to highest ──
           Replaces the old `bg-white/[0.0x]` overlay stack. Solid values, so
           nesting two panels no longer compounds alpha into a third shade. */
        surface: {
          sunken: "rgb(var(--surface-sunken) / <alpha-value>)",
          card: "rgb(var(--surface-card) / <alpha-value>)",
          raised: "rgb(var(--surface-raised) / <alpha-value>)",
          control: "rgb(var(--surface-control) / <alpha-value>)",
          hover: "rgb(var(--surface-hover) / <alpha-value>)",
          active: "rgb(var(--surface-active) / <alpha-value>)",
          /* Legacy aliases — kept so existing call sites keep working. */
          lowest: "rgb(var(--surface-sunken) / <alpha-value>)",
          low: "rgb(var(--surface-control) / <alpha-value>)",
          container: "rgb(var(--surface-control) / <alpha-value>)",
          highest: "rgb(var(--surface-highest) / <alpha-value>)",
        },

        /* ── Text tiers ──
           `DEFAULT`/`muted`/`dim` all clear 4.5:1 against the card surfaces
           in BOTH themes and are the only tiers permitted to carry text.
           `faint` sits at ~3:1 and is for non-text marks only — separator
           bullets, idle icons, dashed placeholder glyphs. */
        ink: {
          /* One step brighter than DEFAULT — the emphasis tier that bare
             `text-white` used to serve, now with a light-theme counterpart. */
          strong: "rgb(var(--ink-strong) / <alpha-value>)",
          DEFAULT: "rgb(var(--ink) / <alpha-value>)",
          muted: "rgb(var(--ink-muted) / <alpha-value>)",
          dim: "rgb(var(--ink-dim) / <alpha-value>)",
          faint: "rgb(var(--ink-faint) / <alpha-value>)",
        },
        /* Text/icons drawn on a solid ink fill (e.g. the primary button). */
        "on-ink": "rgb(var(--on-ink) / <alpha-value>)",

        /* ── Hairlines ──
           Tint flips per theme; the per-site alpha is preserved, so
           `ring-line/[0.06]` reads correctly on both grounds. */
        line: "rgb(var(--line) / <alpha-value>)",
        /* Backdrops and vignettes. Near-black in dark, ink-tinted in light. */
        scrim: "rgb(var(--scrim) / <alpha-value>)",
        /* Specular highlight. Exists on dark, suppressed on paper — see
           --sheen-a in globals.css. Use `sheen/[a]`, e.g. `from-sheen/[0.04]`. */
        sheen: "rgb(var(--sheen) / calc(<alpha-value> * var(--sheen-a)))",
        /* The shadow-side counterpart to `sheen` — a vignette that exists
           only on a dark ground. Suppressed on paper by the same switch. */
        depth: "rgb(var(--scrim) / calc(<alpha-value> * var(--sheen-a)))",
        /* Focus indicator — deliberately NOT a hairline. A 6% edge is
           invisible as a focus ring on paper. */
        focus: "rgb(var(--focus) / <alpha-value>)",

        /* ── Semantic ──
           Darkened in the light theme; the dark-theme values sit at 2-3:1
           on paper and would fail as text. */
        "orbit-amber": "rgb(var(--orbit-amber) / <alpha-value>)",
        "orbit-red": "rgb(var(--orbit-red) / <alpha-value>)",
        "orbit-green": "rgb(var(--orbit-green) / <alpha-value>)",
        "orbit-blue": "rgb(var(--orbit-blue) / <alpha-value>)",
        "orbit-violet": "rgb(var(--orbit-violet) / <alpha-value>)",
        "orbit-teal": "rgb(var(--orbit-teal) / <alpha-value>)",
        "orbit-gold": "rgb(var(--orbit-gold) / <alpha-value>)",
        "orbit-pink": "rgb(var(--orbit-pink) / <alpha-value>)",

        /* ── Legacy shadcn-style aliases, now theme-aware ── */
        background: "rgb(var(--base) / <alpha-value>)",
        foreground: "rgb(var(--ink) / <alpha-value>)",
        primary: {
          DEFAULT: "rgb(var(--ink) / <alpha-value>)",
          foreground: "rgb(var(--on-ink) / <alpha-value>)",
          container: "rgb(var(--surface-active) / <alpha-value>)",
        },
        secondary: {
          DEFAULT: "rgb(var(--surface-control) / <alpha-value>)",
          foreground: "rgb(var(--ink) / <alpha-value>)",
        },
        tertiary: {
          DEFAULT: "rgb(var(--orbit-amber) / <alpha-value>)",
        },
        muted: {
          DEFAULT: "rgb(var(--surface-control) / <alpha-value>)",
          foreground: "rgb(var(--ink-dim) / <alpha-value>)",
        },
        destructive: {
          DEFAULT: "rgb(var(--orbit-red) / <alpha-value>)",
          foreground: "rgb(var(--on-ink) / <alpha-value>)",
        },
        "on-surface": "rgb(var(--ink) / <alpha-value>)",
        "on-surface-variant": "rgb(var(--ink-muted) / <alpha-value>)",
        "outline-variant": "rgb(var(--line) / 0.18)",
        border: "rgb(var(--line) / 0.18)",
      },
      boxShadow: {
        card: "var(--shadow-card)",
        raised: "var(--shadow-raised)",
        overlay: "var(--shadow-overlay)",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        // Both resolve to next/font-injected CSS variables set on <html> in
        // layout.tsx. The fallbacks only apply if that class is ever missing.
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      fontSize: {
        "display-lg": ["3.5rem", { lineHeight: "1.1", letterSpacing: "-0.02em", fontWeight: "300" }],
        "body-md": ["1rem", { lineHeight: "1.6" }],
      },
      spacing: {
        '16': '4rem',
        '20': '5rem',
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in": {
          "0%": { opacity: "0", transform: "translateX(-8px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        "scale-in": {
          "0%": { opacity: "0", transform: "scale(0.96)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.2s ease-out",
        "slide-in": "slide-in 0.2s ease-out",
        "scale-in": "scale-in 0.2s ease-out",
        shimmer: "shimmer 2s infinite linear",
      },
    },
  },
  plugins: [],
};

export default config;
