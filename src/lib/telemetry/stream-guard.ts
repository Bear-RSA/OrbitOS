import { adminDb } from "@/lib/firebase/admin";

/* ------------------------------------------------------------------ */
/*  Telemetry Stream Cost Guard                                        */
/*                                                                     */
/*  Every accepted connection to /api/telemetry/stream costs real      */
/*  Firestore reads: the initial window (WINDOW_SIZE docs) plus the    */
/*  lifetime-count aggregate, before the listener has delivered a      */
/*  single live event. On the Spark plan an abusive caller ran into    */
/*  the free daily ceiling and the feed simply stopped. On Blaze there */
/*  is no ceiling — the same traffic bills instead. This module is     */
/*  what replaces the ceiling we gave up.                              */
/*                                                                     */
/*  Two independent controls, because they stop different things:      */
/*                                                                     */
/*    Concurrency — how many listeners one user (or one project, or    */
/*    this whole process) may hold open at once. Stops fan-out: fifty  */
/*    tabs, or a script opening connections and leaving them parked.   */
/*                                                                     */
/*    Connect rate — how often one user may open a NEW stream. Stops   */
/*    the reconnect loop, which concurrency alone cannot see: a client */
/*    that connects, reads its window, drops, and reconnects never     */
/*    holds more than one slot while burning WINDOW_SIZE reads a       */
/*    cycle.                                                           */
/*                                                                     */
/*  SCOPE — read before trusting these numbers. State here lives in    */
/*  process memory, and on Vercel that means per lambda instance, not  */
/*  per deployment. A caller spread across many cold instances gets a  */
/*  fresh allowance on each. This bounds the blast radius rather than  */
/*  enforcing a global cap; a hard global cap needs shared state       */
/*  (Redis, or Firestore counters — the latter charging reads to save  */
/*  reads). Worth revisiting only if the bill says it is.              */
/* ------------------------------------------------------------------ */

/**
 * Hard ceilings. These protect the Firebase bill and are ALWAYS on —
 * independent of BILLING_GUARDRAILS_ENABLED, which governs the paywall.
 * A tier may narrow a user's allowance below these; nothing widens it.
 */
const HARD_MAX_PER_USER = 6;
const HARD_MAX_PER_PROJECT = 25;
const HARD_MAX_GLOBAL = 200;

/**
 * Connect-rate window. The legitimate client already reconnects on its own:
 * exponential backoff after an error, plus an immediate retry whenever a
 * background tab becomes visible again. A user moving between tabs can
 * honestly produce several connects a minute, so the window has to sit above
 * that and still below anything that costs money.
 *
 * At WINDOW_SIZE 60, six connects is ~360 reads. Tripping the limit parks the
 * user for COOLDOWN_MS, capping a pathological client near 120 reads/min —
 * survivable, and untouchable by normal use.
 */
const CONNECT_WINDOW_MS = 60_000;
const MAX_CONNECTS_PER_WINDOW = 6;
const COOLDOWN_MS = 120_000;

/** How long a user record with no activity is kept before being swept. */
const RECORD_TTL_MS = 300_000;

interface UserRecord {
  /** Streams currently held open by this user on this instance. */
  active: number;
  /** Timestamps of recent connects, pruned to CONNECT_WINDOW_MS. */
  connects: number[];
  /** Epoch ms until which this user is refused, or 0. */
  blockedUntil: number;
  /** Last touch, for sweeping. */
  seen: number;
}

const users = new Map<string, UserRecord>();
const projects = new Map<string, number>();
let globalActive = 0;

/** Removes idle records so a long-lived instance does not accumulate one
 *  entry per user who ever connected to it. */
function sweep(now: number) {
  for (const [uid, rec] of users) {
    if (rec.active > 0) continue;
    if (now - rec.seen < RECORD_TTL_MS) continue;
    if (rec.blockedUntil > now) continue;
    users.delete(uid);
  }
}

export type StreamAdmission =
  | { admitted: true; release: () => void }
  | { admitted: false; reason: string; retryAfterSeconds: number };

interface AdmitOptions {
  uid: string;
  projectId: string;
  /**
   * Per-user concurrent stream allowance from the caller's subscription tier.
   * -1 means "tier imposes no limit" — the hard ceiling still applies.
   */
  tierLimit: number;
}

/**
 * Decides whether one more live telemetry stream may be opened, and reserves
 * a slot if so.
 *
 * The returned `release` is idempotent and MUST be called from the stream's
 * teardown — including the error and abort paths. A missed release leaks a
 * slot for the lifetime of the instance, which surfaces as a user who cannot
 * reopen their own feed.
 */
export function admitStream({ uid, projectId, tierLimit }: AdmitOptions): StreamAdmission {
  const now = Date.now();
  sweep(now);

  let rec = users.get(uid);
  if (!rec) {
    rec = { active: 0, connects: [], blockedUntil: 0, seen: now };
    users.set(uid, rec);
  }
  rec.seen = now;

  if (rec.blockedUntil > now) {
    return {
      admitted: false,
      reason: "Telemetry reconnect rate exceeded.",
      retryAfterSeconds: Math.ceil((rec.blockedUntil - now) / 1000),
    };
  }

  // Rate check runs before the concurrency checks: a reconnect loop should be
  // parked for the cooldown, not merely refused this one connection and left
  // free to try again immediately.
  rec.connects = rec.connects.filter((t) => now - t < CONNECT_WINDOW_MS);
  if (rec.connects.length >= MAX_CONNECTS_PER_WINDOW) {
    rec.blockedUntil = now + COOLDOWN_MS;
    console.warn("[StreamGuard] Connect rate exceeded:", {
      uid,
      projectId,
      connects: rec.connects.length,
      cooldownMs: COOLDOWN_MS,
    });
    return {
      admitted: false,
      reason: "Telemetry reconnect rate exceeded.",
      retryAfterSeconds: Math.ceil(COOLDOWN_MS / 1000),
    };
  }

  if (globalActive >= HARD_MAX_GLOBAL) {
    console.warn("[StreamGuard] Global stream ceiling reached:", { globalActive });
    return {
      admitted: false,
      reason: "Telemetry capacity reached. Try again shortly.",
      retryAfterSeconds: 30,
    };
  }

  const projectActive = projects.get(projectId) ?? 0;
  if (projectActive >= HARD_MAX_PER_PROJECT) {
    return {
      admitted: false,
      reason: "Too many live telemetry viewers on this project.",
      retryAfterSeconds: 30,
    };
  }

  // A tier may only narrow the allowance, never widen it past the ceiling.
  const effectiveUserLimit =
    tierLimit === -1 ? HARD_MAX_PER_USER : Math.min(tierLimit, HARD_MAX_PER_USER);

  if (rec.active >= effectiveUserLimit) {
    return {
      admitted: false,
      reason: `Live telemetry is limited to ${effectiveUserLimit} concurrent ${
        effectiveUserLimit === 1 ? "stream" : "streams"
      }.`,
      retryAfterSeconds: 30,
    };
  }

  rec.connects.push(now);
  rec.active += 1;
  projects.set(projectId, projectActive + 1);
  globalActive += 1;

  let released = false;
  return {
    admitted: true,
    release: () => {
      if (released) return;
      released = true;

      const current = users.get(uid);
      if (current) {
        current.active = Math.max(0, current.active - 1);
        current.seen = Date.now();
      }

      const remaining = (projects.get(projectId) ?? 1) - 1;
      if (remaining <= 0) projects.delete(projectId);
      else projects.set(projectId, remaining);

      globalActive = Math.max(0, globalActive - 1);
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Lifetime event count cache                                         */
/* ------------------------------------------------------------------ */

/**
 * The `activity` count aggregate is billed per 1000 index entries scanned, and
 * it was previously run on every single connect — so a reconnecting client
 * paid for it every cycle, for a number that barely moves.
 *
 * Caching it per project means a reconnect storm resolves the total for free.
 * The cost is staleness of at most COUNT_TTL_MS on a figure that is already
 * approximate between refreshes: the live listener increments the client's
 * copy on every `added` delta, so what the user watches stays correct.
 */
const COUNT_TTL_MS = 30_000;

const countCache = new Map<string, { value: number; expires: number }>();

export async function getProjectEventTotal(projectId: string): Promise<number> {
  const now = Date.now();
  const hit = countCache.get(projectId);
  if (hit && hit.expires > now) return hit.value;

  try {
    // Counted WITHOUT the window's orderBy/limit — with them the aggregate
    // would cap at the window size and report it back as if it were the
    // project's lifetime event count.
    const snap = await adminDb
      .collection("activity")
      .where("projectId", "==", projectId)
      .count()
      .get();

    const value = snap.data().count;
    countCache.set(projectId, { value, expires: now + COUNT_TTL_MS });
    return value;
  } catch {
    // A count failure must not cost the caller their live feed. Not cached —
    // a transient error should not pin zero for the whole TTL.
    return 0;
  }
}
