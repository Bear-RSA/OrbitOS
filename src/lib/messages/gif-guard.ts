/* ------------------------------------------------------------------ */
/*  GIF search rate guard                                              */
/*                                                                     */
/*  ALWAYS on, independent of BILLING_GUARDRAILS_ENABLED — the same    */
/*  split `lib/calls/ceiling` and the telemetry stream guard make.     */
/*                                                                     */
/*  THE QUOTA IS THE WHOLE REASON THIS EXISTS. A GIPHY beta key allows */
/*  100 searches PER HOUR, and it is one key for the entire            */
/*  deployment. That is not a per-user allowance being shared politely */
/*  — one client stuck in a search loop exhausts the hour for every    */
/*  workspace at once, and the picker then shows everybody an empty    */
/*  grid.                                                              */
/*                                                                     */
/*  So there are two limits, and the global one is the point. The      */
/*  per-user cap stops a single person monopolising what is left; the  */
/*  global cap keeps the whole deployment inside the allowance with    */
/*  headroom to spare.                                                 */
/*                                                                     */
/*  The 10-minute response cache in `gif-provider` does most of the    */
/*  real work — trending is the commonest request and is served from   */
/*  cache — so these ceilings are a backstop, not the first line.      */
/* ------------------------------------------------------------------ */

/** Matches the provider's own accounting period. */
export const SEARCH_WINDOW_MS = 60 * 60_000;

/**
 * Deliberately under the provider's 100, so a burst near the boundary
 * does not tip the deployment into hard failures it cannot see coming.
 */
export const MAX_SEARCHES_GLOBAL = 80;

/** One person cannot take more than a quarter of the hour's allowance. */
export const MAX_SEARCHES_PER_USER = 20;

/** Records older than this are swept — a picker closed is a picker gone. */
const RECORD_TTL_MS = 2 * SEARCH_WINDOW_MS;

export type SearchAdmission =
  | { allowed: true }
  | { allowed: false; reason: "user" | "global"; retryAfterMs: number };

interface Window {
  start: number;
  count: number;
}

export interface SearchGuard {
  admit(uid: string, now?: number): SearchAdmission;
  /** Live record count, for tests and for a health check. */
  size(): number;
}

/**
 * A guard with its own store.
 *
 * A factory rather than module-level state so the tests do not have to
 * reach into a shared map and reset it between cases — shared mutable
 * state is exactly what makes rate-limit code hard to trust.
 */
export function createSearchGuard(
  windowMs: number = SEARCH_WINDOW_MS,
  maxPerUser: number = MAX_SEARCHES_PER_USER,
  maxGlobal: number = MAX_SEARCHES_GLOBAL
): SearchGuard {
  const users = new Map<string, Window>();
  /* Null until the first request, so the window starts when traffic
     does. Seeding it at the epoch would date the first window to 1970
     and make the very first `retryAfterMs` meaningless. */
  let global: Window | null = null;
  let lastSweep = 0;

  function sweep(now: number) {
    if (now - lastSweep < RECORD_TTL_MS) return;
    lastSweep = now;
    for (const [uid, window] of users) {
      if (now - window.start > RECORD_TTL_MS) users.delete(uid);
    }
  }

  function roll(window: Window, now: number): Window {
    return now - window.start >= windowMs ? { start: now, count: 0 } : window;
  }

  return {
    admit(uid: string, now: number = Date.now()): SearchAdmission {
      sweep(now);

      /* Checked before the per-user count is spent, so somebody refused
         by the global ceiling does not also burn their own allowance
         waiting for it to clear. */
      global = roll(global ?? { start: now, count: 0 }, now);
      if (global.count >= maxGlobal) {
        return {
          allowed: false,
          reason: "global",
          retryAfterMs: global.start + windowMs - now,
        };
      }

      const window = roll(users.get(uid) ?? { start: now, count: 0 }, now);
      if (window.count >= maxPerUser) {
        users.set(uid, window);
        return {
          allowed: false,
          reason: "user",
          retryAfterMs: window.start + windowMs - now,
        };
      }

      window.count += 1;
      users.set(uid, window);
      global.count += 1;

      return { allowed: true };
    },

    size: () => users.size,
  };
}

/**
 * The one the route uses.
 *
 * Per server instance, which under-counts across a horizontally scaled
 * deployment — three instances could each allow 80. That is accepted:
 * the alternative is a shared counter in Firestore, which would mean a
 * read and a write on every keystroke of a search box, and the cache in
 * front of this makes the real request rate far lower than the ceiling
 * suggests. Revisit if the quota is ever actually hit.
 */
export const gifSearchGuard = createSearchGuard();
