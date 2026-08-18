"use client";

import { useEffect } from "react";
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
export function PreferenceEffects() {
  const { user } = useAuth();
  const { reducedMotion, theme } = resolvePreferences(user?.preferences);

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

    document.documentElement.setAttribute("data-theme", theme);

    // Mirror for the next cold start, so `ThemeScript` can apply the choice
    // before paint instead of waiting on Firestore.
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Storage unavailable — the theme still applies for this session, it
      // just cannot be pre-applied on the next one.
    }
  }, [user, theme]);

  return null;
}
