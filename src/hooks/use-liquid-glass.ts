"use client";

import { RefObject, useEffect, useState, useSyncExternalStore } from "react";

/* ------------------------------------------------------------------ */
/*  Liquid glass                                                       */
/*                                                                     */
/*  Puts quick-liquid's refracting lens on a panel. The lens bends the */
/*  page behind the panel's rim through an SVG displacement map fed   */
/*  to `backdrop-filter: url()`, which only Chromium renders. Safari  */
/*  and Firefox keep the panel's own CSS material instead, as do       */
/*  touch screens — the fog already drops its blur there for scroll   */
/*  cost, and a lens per card is heavier than the blur was — and       */
/*  anyone who asked for less transparency or more contrast.           */
/*                                                                     */
/*  The panel must render its children inside a `.ql-content` element */
/*  of its own. Without one the engine moves React's nodes into a     */
/*  wrapper it made, and React loses track of them.                    */
/*                                                                     */
/*  Nothing on the panel or above it may carry `filter`, `opacity`    */
/*  under 1, `mask` or its own `backdrop-filter` while the lens is    */
/*  live: each one walls the lens off from the page and it refracts   */
/*  nothing.                                                           */
/* ------------------------------------------------------------------ */

const QUERIES = [
  "(pointer: fine)",
  "(prefers-reduced-transparency: reduce)",
  "(prefers-contrast: more)",
];

function isChromium(): boolean {
  const brands = (navigator as Navigator & { userAgentData?: { brands?: { brand: string }[] } })
    .userAgentData?.brands;
  return Array.isArray(brands) && brands.some((b) => b.brand === "Chromium");
}

function readSupport(): boolean {
  const [fine, lessTransparency, moreContrast] = QUERIES.map((q) => window.matchMedia(q).matches);
  return isChromium() && fine && !lessTransparency && !moreContrast;
}

function subscribe(onChange: () => void): () => void {
  const media = QUERIES.map((q) => window.matchMedia(q));
  media.forEach((m) => m.addEventListener("change", onChange));
  return () => media.forEach((m) => m.removeEventListener("change", onChange));
}

/** Whether this browser and this operator get the refracting lens. */
export function useLiquidGlassSupport(): boolean {
  return useSyncExternalStore(subscribe, readSupport, () => false);
}

interface LiquidGlassOptions {
  /** Theme token the glass is tinted with, e.g. "surface-card". */
  tint: string;
  /** Opacity of that tint. The fog it replaces sits at 0.4. */
  tintOpacity: number;
  /**
   * Frost in px. Light over the orbit backdrop; heavy for anything that
   * floats over the page's own text, which must not read through.
   */
  blur: number;
  /** Keep the CSS material even where glass is supported. */
  disabled?: boolean;
}

function readConfig(el: HTMLElement, { tint, tintOpacity, blur }: LiquidGlassOptions) {
  const root = getComputedStyle(document.documentElement);
  return {
    material: "regular" as const,
    // Tokens are "r g b"; the engine writes rgba(r, g, b, a).
    tint: root.getPropertyValue(`--${tint}`).trim().split(/\s+/).join(", "),
    tintOpacity,
    blur,
    // The bend lives in a rim band no wider than the cards' padding, so it
    // can be strong without ever passing under text.
    refractionStrength: 24,
    bezelWidth: 32,
    // The sheen is a ring as wide as the bezel with a hard inner edge, so
    // on a dark card it reads as a second panel inset inside the first.
    // The 1px rim carries the light on its own.
    specularStrength: 0,
    // `color-scheme` is already resolved per theme, "system" included.
    appearance: root.colorScheme === "light" ? ("light" as const) : ("dark" as const),
    // Square bars are 0, which is a real radius, not a missing one.
    borderRadius: parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0,
    // The panel keeps its own ring and shadow (see `.liquid-glass`).
    elevation: 0,
    // Support was decided above; skip the engine's own style probe.
    refractionMode: "svg" as const,
  };
}

/**
 * Mounts the lens on `ref` while supported. Returns true once the lens is
 * in place, so the panel can drop the CSS material it was wearing — not
 * before, or the panel would flash bare while the engine loads.
 */
export function useLiquidGlass(ref: RefObject<HTMLElement | null>, options: LiquidGlassOptions): boolean {
  const supported = useLiquidGlassSupport();
  const [live, setLive] = useState(false);
  const { tint, tintOpacity, blur, disabled } = options;

  useEffect(() => {
    const el = ref.current;
    if (!supported || disabled || !el) return;

    let cancelled = false;
    let teardown: (() => void) | undefined;

    // Loaded on demand: browsers that never get the lens never download it.
    import("quick-liquid/core").then(({ LiquidGlassEngine }) => {
      if (cancelled) return;
      const opts = { tint, tintOpacity, blur };
      const engine = new LiquidGlassEngine(el, readConfig(el, opts));
      setLive(true);

      // A theme switch changes the tint token and the appearance.
      const sync = () => engine.setConfig(readConfig(el, opts));
      const scheme = window.matchMedia("(prefers-color-scheme: dark)");
      scheme.addEventListener("change", sync);
      const observer = new MutationObserver(sync);
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

      teardown = () => {
        scheme.removeEventListener("change", sync);
        observer.disconnect();
        engine.destroy();
      };
    });

    return () => {
      cancelled = true;
      teardown?.();
      setLive(false);
    };
  }, [ref, supported, disabled, tint, tintOpacity, blur]);

  return live;
}
