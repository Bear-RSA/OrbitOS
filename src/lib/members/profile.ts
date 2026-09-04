import type { OrbitEvent } from "@/types/event";
import type { Task } from "@/types/task";

/* ------------------------------------------------------------------ */
/*  Member profile facts                                               */
/*                                                                     */
/*  What one member may be told about another, computed from rows the  */
/*  caller already holds. Pure, so the profile card and the Personnel  */
/*  Network cannot end up quoting different numbers for the same       */
/*  person.                                                            */
/* ------------------------------------------------------------------ */

/**
 * Open directives that read as a full plate.
 *
 * Not a limit anybody enforces — nothing refuses a sixth task. It is the
 * denominator that turns a count into "how loaded is this person", and
 * it matches the figure the Personnel Network has always used, so the
 * two surfaces cannot disagree about who is busy.
 */
export const MAX_SYSTEM_LOAD = 5;

export interface Workload {
  open: number;
  /** 0-100, clamped. */
  loadPercent: number;
}

/** Open directives assigned to one person, as a count and a proportion. */
export function workloadFor(tasks: Task[], uid: string): Workload {
  const open = tasks.filter(
    (task) => task.status !== "done" && task.assignedTo?.includes(uid)
  ).length;

  return {
    open,
    loadPercent: Math.min(100, Math.round((open / MAX_SYSTEM_LOAD) * 100)),
  };
}

/**
 * Engagements both people were on, most recent first.
 *
 * Cancelled ones are dropped: "we met on the 4th" is false if the
 * meeting was called off, and a cancelled engagement keeps its record
 * precisely so it is not mistaken for one that happened.
 *
 * No new access question — `events` are readable org-wide already, the
 * same rule the calendar and the Personnel Network read them under.
 */
export function sharedEngagements(
  events: OrbitEvent[],
  uidA: string,
  uidB: string,
  limit = 4
): OrbitEvent[] {
  if (uidA === uidB) return [];

  return events
    .filter(
      (event) =>
        event.status !== "cancelled" &&
        event.attendees?.includes(uidA) &&
        event.attendees?.includes(uidB)
    )
    .sort((a, b) => (b.startAt?.toMillis?.() ?? 0) - (a.startAt?.toMillis?.() ?? 0))
    .slice(0, limit);
}
