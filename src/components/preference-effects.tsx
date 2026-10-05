"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/contexts/auth-context";
import { THEME_STORAGE_KEY, resolvePreferences } from "@/types/preferences";

/**
 * Applies the preferences that have to live on the document root rather than
 * inside a single component tree.
 *
 * Mounted inside `AuthProvider` so it re-runs whenever the profile snapshot
 * changes — flipping a toggle in Settings takes effect immediately, on every
 * open tab, without a reload.
 */
/** How long the theme cross-fade holds transitions on. Matches --t-quick. */
const THEME_FADE_MS = 320;

export function PreferenceEffects() {
  const { user } = useAuth();
  const { reducedMotion, theme } = resolvePreferences(user?.preferences);
  // The theme the document currently shows; null until the first apply.
  const appliedTheme = useRef<string | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    if (reducedMotion) {
      root.setAttribute("data-reduced-motion", "true");
    } else {
      root.removeAttribute("data-reduced-motion");
    }
  }, [reducedMotion]);

  useEffect(() => {
    // Only reconcile once a profile has actually loaded. Running on the
    // signed-out default would stomp the value the boot script just applied
    // and flash the page on every cold load.
    if (!user) return;

    const root = document.documentElement;

    // A theme *change* cross-fades; the first apply on load does not, and
    // neither does a cold start (ThemeScript has already painted it). A
    // one-frame jump from black to white is the most jarring thing the
    // app can do, so every colour eases over one beat — see globals.css.
    const isChange = appliedTheme.current !== null && appliedTheme.current !== theme;
    appliedTheme.current = theme;

    let timer: ReturnType<typeof setTimeout> | undefined;
    if (isChange) {
      root.setAttribute("data-theme-transition", "");
      timer = setTimeout(() => root.removeAttribute("data-theme-transition"), THEME_FADE_MS);
    }

    root.setAttribute("data-theme", theme);

    // Mirror for the next cold start, so `ThemeScript` can apply the choice
    // before paint instead of waiting on Firestore.
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Storage unavailable — the theme still applies for this session, it
      // just cannot be pre-applied on the next one.
    }

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [user, theme]);

  return null;
}
