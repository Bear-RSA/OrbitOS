import { toDateKeyInZone } from "@/lib/utils/dates";

/* ------------------------------------------------------------------ */
/*  Workspace timezone                                                 */
/*                                                                     */
/*  Every scheduled notification is timed for South African office     */
/*  hours. Vercel Cron has no timezone parameter — schedules in        */
/*  vercel.json are UTC and nothing else — so the offset is applied    */
/*  here and in the cron expressions rather than by the scheduler.     */
/*                                                                     */
/*  SAST is UTC+2 year round with no daylight saving, which is what    */
/*  makes the fixed arithmetic in vercel.json safe:                    */
/*                                                                     */
/*      06:00 SAST -> "0 4 * * *"                                      */
/*      09:00 SAST -> "0 7 * * *"                                      */
/*      18:00 SAST -> "0 16 * * *"                                     */
/*                                                                     */
/*  The day keys below still go through Intl rather than assuming the  */
/*  offset, so a manual or dry run fired at 23:00 UTC resolves to the  */
/*  South African day the operator means instead of the UTC one.       */
/* ------------------------------------------------------------------ */

export const WORKSPACE_TIMEZONE = "Africa/Johannesburg";

/** Hours SAST runs ahead of UTC. Fixed — the zone observes no DST. */
const SAST_OFFSET_HOURS = 2;

/** The calendar day `now` falls on, read in Johannesburg. */
export function sastDayKey(now: Date): string {
  return toDateKeyInZone(now, WORKSPACE_TIMEZONE);
}

/** The calendar day after the one `now` falls on, read in Johannesburg. */
export function sastNextDayKey(now: Date): string {
  return sastDayKey(new Date(now.getTime() + 24 * 60 * 60 * 1000));
}

/**
 * The instant a given wall-clock hour on a SAST calendar day corresponds to.
 *
 * Used to bound the debrief's window against real timestamps: "18:00 SAST
 * yesterday" is an instant, and comparing Firestore timestamps to a day key
 * requires converting one into the other's terms.
 */
export function sastInstant(dayKey: string, hour: number): Date {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, hour - SAST_OFFSET_HOURS, 0, 0, 0));
}
