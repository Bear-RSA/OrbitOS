"use client";

import { useEffect, useSyncExternalStore } from "react";

import { getInternalManagementBadgesAction } from "@/app/actions/admin-tools";

/* ------------------------------------------------------------------ */
/*  Who wears the IM badge                                             */
/*                                                                     */
/*  One fetch per page load, shared by every avatar on the screen.     */
/*  The server answers with an empty list unless the viewer is in      */
/*  Internal Management, so for everyone else no badge ever draws.     */
/*  Admin Tools calls `refreshInternalManagementBadges` after adding   */
/*  or removing someone.                                               */
/* ------------------------------------------------------------------ */

let ids: ReadonlySet<string> = new Set();
let requested = false;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function refreshInternalManagementBadges(): Promise<void> {
  requested = true;
  const result = await getInternalManagementBadgesAction();
  ids = new Set(result.success ? result.ids : []);
  listeners.forEach((l) => l());
}

const EMPTY: ReadonlySet<string> = new Set();

/** Whether `uid` wears the IM badge for this viewer. Always false outside Internal Management. */
export function useIsInternalManagement(uid: string | undefined): boolean {
  const set = useSyncExternalStore(
    subscribe,
    () => ids,
    () => EMPTY
  );

  useEffect(() => {
    if (uid && !requested) void refreshInternalManagementBadges();
  }, [uid]);

  return uid ? set.has(uid) : false;
}
