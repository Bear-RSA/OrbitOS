import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";

const config: Config = {
  darkMode: ["class", '[data-theme="dark"]'],
  /* `hover:` compiles to `@media (hover: hover)`. Touch fakes a hover on
     tap and leaves it stuck until the next tap elsewhere — a frosted card
     stayed half-lit after you tapped it. Press feedback is `active:`. */
  future: {
    hoverOnlyWhenSupported: true,
  },
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
      /* ── Type scale ──
         Tracking and leading are size-specific, never one value for all
         sizes: display text tightens as it grows and sits on a tight line,
         body stays near zero tracking on a comfortable line. Each entry is
         a set — size, leading, tracking, weight — so hierarchy comes from
         the whole, not from size alone. */
      fontSize: {
        display: [
          "clamp(2.75rem, 2rem + 4vw, 5.5rem)",
          { lineHeight: "0.96", letterSpacing: "-0.035em", fontWeight: "300" },
        ],
        "display-sm": [
          "clamp(2.25rem, 1.6rem + 2.6vw, 4rem)",
          { lineHeight: "1.02", letterSpacing: "-0.03em", fontWeight: "300" },
        ],
        "title-lg": ["2rem", { lineHeight: "1.12", letterSpacing: "-0.022em", fontWeight: "300" }],
        title: ["1.5rem", { lineHeight: "1.2", letterSpacing: "-0.018em", fontWeight: "300" }],
        "title-sm": ["1.25rem", { lineHeight: "1.3", letterSpacing: "-0.012em", fontWeight: "400" }],
        lead: ["1.25rem", { lineHeight: "1.5", letterSpacing: "-0.006em", fontWeight: "300" }],
        body: ["0.9375rem", { lineHeight: "1.6", letterSpacing: "0" }],
        "body-sm": ["0.8125rem", { lineHeight: "1.5", letterSpacing: "0.002em" }],
        caption: ["0.6875rem", { lineHeight: "1.4", letterSpacing: "0.01em" }],
        /* Legacy names, kept for existing call sites. */
        "display-lg": ["3.5rem", { lineHeight: "1.1", letterSpacing: "-0.02em", fontWeight: "300" }],
        "body-md": ["1rem", { lineHeight: "1.6" }],
      },
      /* ── Motion ──
         Springs, not curves. `spring` is critically damped and is the house
         default; `spring-bounce` overshoots slightly and is reserved for
         things that arrive with momentum. Durations are settle times of
         those springs, so the curve lands exactly at the end. See
         src/lib/motion/spring.ts, which generated them. */
      transitionTimingFunction: {
        spring: "var(--ease-spring)",
        "spring-bounce": "var(--ease-spring-bounce)",
        press: "var(--ease-press)",
      },
      transitionDuration: {
        press: "var(--t-press)",
        quick: "var(--t-quick)",
        spring: "var(--t-spring)",
        settle: "var(--t-settle)",
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
  plugins: [
    /* Enter / exit utilities.
       `animate-in`, `fade-in-0`, `zoom-in-95`, `slide-in-from-*` had been
       in the markup since the shadcn primitives landed, but the plugin that
       defines them was never installed, so every dialog, select and auth
       page mounted with no motion at all. This implements the subset the
       codebase uses, on the spring easing, plus `blur-in-*` so a glass
       surface can materialise rather than fade. Keyframes are in
       globals.css. */
    plugin(({ addUtilities, matchUtilities, theme }) => {
      addUtilities({
        ".animate-in": {
          animationName: "enter",
          animationDuration: "var(--t-spring)",
          animationTimingFunction: "var(--ease-spring)",
          animationFillMode: "both",
          "--tw-enter-opacity": "initial",
          "--tw-enter-scale": "initial",
          "--tw-enter-blur": "initial",
          "--tw-enter-translate-x": "initial",
          "--tw-enter-translate-y": "initial",
        },
        ".animate-out": {
          animationName: "exit",
          animationDuration: "var(--t-quick)",
          animationTimingFunction: "var(--ease-spring)",
          animationFillMode: "both",
          "--tw-exit-opacity": "initial",
          "--tw-exit-scale": "initial",
          "--tw-exit-blur": "initial",
          "--tw-exit-translate-x": "initial",
          "--tw-exit-translate-y": "initial",
        },
        ".fill-mode-both": { animationFillMode: "both" },
        ".fill-mode-forwards": { animationFillMode: "forwards" },
      });

      const opacity = { DEFAULT: "0", 0: "0", 5: "0.05", 10: "0.1", 25: "0.25", 50: "0.5", 75: "0.75", 90: "0.9" };
      const scale = { DEFAULT: "0", 0: "0", 50: "0.5", 75: "0.75", 90: "0.9", 95: "0.95", 100: "1", 105: "1.05", 110: "1.1" };
      const blur = { DEFAULT: "8px", sm: "4px", md: "8px", lg: "16px", none: "0px" };
      type Values = Record<string, string>;
      const distance = theme("spacing") as Values;

      matchUtilities(
        {
          "fade-in": (v) => ({ "--tw-enter-opacity": v }),
          "fade-out": (v) => ({ "--tw-exit-opacity": v }),
        },
        { values: opacity }
      );
      matchUtilities(
        {
          "zoom-in": (v) => ({ "--tw-enter-scale": v }),
          "zoom-out": (v) => ({ "--tw-exit-scale": v }),
        },
        { values: scale }
      );
      matchUtilities(
        {
          "blur-in": (v) => ({ "--tw-enter-blur": v }),
          "blur-out": (v) => ({ "--tw-exit-blur": v }),
        },
        { values: blur }
      );
      matchUtilities(
        {
          "slide-in-from-top": (v) => ({ "--tw-enter-translate-y": `calc(-1 * ${v})` }),
          "slide-in-from-bottom": (v) => ({ "--tw-enter-translate-y": v }),
          "slide-in-from-left": (v) => ({ "--tw-enter-translate-x": `calc(-1 * ${v})` }),
          "slide-in-from-right": (v) => ({ "--tw-enter-translate-x": v }),
          "slide-out-to-top": (v) => ({ "--tw-exit-translate-y": `calc(-1 * ${v})` }),
          "slide-out-to-bottom": (v) => ({ "--tw-exit-translate-y": v }),
          "slide-out-to-left": (v) => ({ "--tw-exit-translate-x": `calc(-1 * ${v})` }),
          "slide-out-to-right": (v) => ({ "--tw-exit-translate-x": v }),
        },
        { values: { ...distance, full: "100%", "1/2": "50%", "1/3": "33.333%", "2/3": "66.667%" } }
      );
      /* Core `duration-*` / `delay-*` only touch transitions; make the same
         class time an animation too, so `animate-in duration-1000` works. */
      matchUtilities(
        { duration: (v) => ({ animationDuration: v }) },
        { values: theme("transitionDuration") as Values }
      );
      matchUtilities(
        { delay: (v) => ({ animationDelay: v }) },
        { values: theme("transitionDelay") as Values }
      );
    }),
  ],
};

export default config;
