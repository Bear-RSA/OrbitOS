"use client";

import { useCallback, useMemo, useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/contexts/auth-context";
import {
  DEFAULT_PREFERENCES,
  UserPreferences,
  resolvePreferences,
} from "@/types/preferences";

/**
 * Reads preferences off the live auth profile and writes patches back to
 * `users/{uid}.preferences`.
 *
 * There is deliberately no local copy of the values: `AuthProvider` already
 * holds an `onSnapshot` subscription on the user document, so a successful
 * write re-renders every consumer. Keeping a second copy here would let the
 * settings UI and the rest of the app disagree after a failed write.
 */
export function usePreferences() {
  const { user } = useAuth();
  const [pending, setPending] = useState<keyof UserPreferences | null>(null);
  const [error, setError] = useState<string | null>(null);

  const preferences = useMemo(
    () => resolvePreferences(user?.preferences),
    [user?.preferences]
  );

  const update = useCallback(
    async (patch: Partial<UserPreferences>) => {
      if (!user) return;
      const [key] = Object.keys(patch) as (keyof UserPreferences)[];
      setPending(key ?? null);
      setError(null);
      try {
        // Merged rather than replaced so a client running an older build
        // cannot drop keys it does not know about.
        await updateDoc(doc(db, "users", user.id), {
          preferences: { ...preferences, ...patch },
        });
      } catch (err) {
        console.error("[Preferences] Update failed", err);
        setError("Could not save that setting. Try again.");
      } finally {
        setPending(null);
      }
    },
    [user, preferences]
  );

  return {
    preferences,
    defaults: DEFAULT_PREFERENCES,
    update,
    pending,
    error,
    ready: Boolean(user),
  };
}
