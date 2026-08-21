import { adminDb } from "@/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";

import { sastDayKey } from "@/lib/utils/sast";

/* ------------------------------------------------------------------ */
/*  Scheduled run outcomes                                             */
/*                                                                     */
/*  Every scheduled mail used to report itself into a Vercel log and    */
/*  nowhere else. A run that built the right mail, addressed it to the  */
/*  right person and had it refused by Resend looked — from the only    */
/*  place anyone actually checks, an inbox — exactly like a run that    */
/*  never happened. Four mails failed that way on 2026-08-21 and the    */
/*  only signal was an empty inbox at 18:49.                            */
/*                                                                     */
/*  So each run now writes what it did to `scheduled_runs`, and the     */
/*  dashboard reads it back. The log is the diagnosis; this is the      */
/*  alarm.                                                              */
/*                                                                     */
/*  Same document the debrief already claims its day with, so a         */
/*  claimed-but-dead run and its outcome stay in one place: id is       */
/*  `{job}-{dayKey}`, one per job per day, and a re-run with force      */
/*  overwrites the outcome rather than appending a second record.       */
/* ------------------------------------------------------------------ */

/** Errors kept on the record. Beyond this the count carries the rest. */
const MAX_ERRORS = 5;

/** How far back the dashboard looks. Older failures are the log's job. */
const LOOKBACK_DAYS = 3;

export type RunStatus = "ok" | "degraded" | "failed";

export type ScheduledJob =
  | "debrief"
  | "due-today"
  | "owner-digest"
  | "due-tomorrow";

/** What every scheduled mail is expected to say about itself. */
export interface RunOutcome {
  job: ScheduledJob;
  dayKey: string;
  status: RunStatus;
  emailsSent: number;
  emailsFailed: number;
  /** Failure reasons, verbatim from the sender. Capped. */
  errors: string[];
  /** ISO 8601. */
  finishedAt: string;
}

/**
 * `ok` means nothing was refused — including the ordinary case of a quiet
 * day with nothing to send. `failed` is reserved for a run that had mail to
 * deliver and delivered none of it, which is the shape of a broken
 * credential or a dead provider. Anything in between is `degraded`: one
 * bad address should not raise the same alarm as an outage.
 */
export function statusOf(emailsSent: number, emailsFailed: number): RunStatus {
  if (emailsFailed === 0) return "ok";
  if (emailsSent === 0) return "failed";
  return "degraded";
}

/**
 * Records one run.
 *
 * Never throws. A run that sent its mail correctly must not be reported as
 * a failure because the bookkeeping afterwards could not be written — the
 * mail is the product, this is the receipt.
 */
export async function recordRunOutcome(outcome: {
  job: ScheduledJob;
  dayKey?: string;
  emailsSent: number;
  emailsFailed: number;
  errors?: string[];
  now?: Date;
}): Promise<void> {
  const now = outcome.now ?? new Date();
  const dayKey = outcome.dayKey ?? sastDayKey(now);
  const errors = outcome.errors ?? [];

  const kept = errors.slice(0, MAX_ERRORS);
  if (errors.length > kept.length) {
    kept.push(`+ ${errors.length - kept.length} more`);
  }

  try {
    await adminDb
      .collection("scheduled_runs")
      .doc(`${outcome.job}-${dayKey}`)
      .set(
        {
          job: outcome.job,
          dayKey,
          status: statusOf(outcome.emailsSent, outcome.emailsFailed),
          emailsSent: outcome.emailsSent,
          emailsFailed: outcome.emailsFailed,
          errors: kept,
          finishedAt: Timestamp.fromDate(now),
        },
        { merge: true }
      );
  } catch (err) {
    console.error(`[RunLog] Could not record ${outcome.job}-${dayKey}:`, err);
  }
}

/**
 * Records a run that threw before it could report on itself.
 *
 * Counted as one failure rather than zero: a crashed run is not a quiet
 * day, and a status of `ok` is the one thing it must not be able to claim.
 */
export async function recordRunCrash(
  job: ScheduledJob,
  error: string,
  now?: Date
): Promise<void> {
  await recordRunOutcome({
    job,
    emailsSent: 0,
    emailsFailed: 1,
    errors: [error],
    now,
  });
}

/**
 * The last few days of runs that did not go cleanly.
 *
 * Read by the dashboard banner. `scheduled_runs` is deny-all in
 * firestore.rules — as it must be, since it is workspace-wide operational
 * state — so this runs Admin-side behind a session check in the route.
 */
export async function readRecentRunFailures(options?: {
  now?: Date;
  days?: number;
}): Promise<RunOutcome[]> {
  const now = options?.now ?? new Date();
  const days = options?.days ?? LOOKBACK_DAYS;

  // Day keys sort lexicographically because they are zero-padded ISO dates,
  // so a string range is a date range and needs no composite index.
  const cutoff = sastDayKey(new Date(now.getTime() - days * 24 * 60 * 60 * 1000));

  try {
    const snap = await adminDb
      .collection("scheduled_runs")
      .where("dayKey", ">=", cutoff)
      .get();

    return snap.docs
      .map((doc) => doc.data())
      .filter((data) => data.status === "failed" || data.status === "degraded")
      .map((data) => ({
        job: data.job as ScheduledJob,
        dayKey: data.dayKey as string,
        status: data.status as RunStatus,
        emailsSent: data.emailsSent ?? 0,
        emailsFailed: data.emailsFailed ?? 0,
        errors: Array.isArray(data.errors) ? data.errors : [],
        finishedAt:
          data.finishedAt instanceof Timestamp
            ? data.finishedAt.toDate().toISOString()
            : new Date(0).toISOString(),
      }))
      .sort((a, b) => b.finishedAt.localeCompare(a.finishedAt));
  } catch (err) {
    console.error("[RunLog] Could not read recent failures:", err);
    return [];
  }
}
