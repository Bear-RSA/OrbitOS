import { sendDueTodayDigest } from "@/lib/email/sendDueTodayDigest";
import { runDueMailer, type DueMailRunResult } from "@/lib/tasks/due-mailer";
import { sastDayKey } from "@/lib/utils/sast";

/* ------------------------------------------------------------------ */
/*  Due-today digest                                                   */
/*                                                                     */
/*  The 06:00 SAST bookend to the 09:00 due-tomorrow reminder: one     */
/*  mail per person listing everything of theirs due TODAY, so the day */
/*  opens with the list instead of with the dashboard.                 */
/*                                                                     */
/*  Everything about who receives one — the owner fallback for         */
/*  unclaimed work, opt-outs, tier and hard ceilings, wave pacing —    */
/*  is `due-mailer`'s, shared with the reminder. Only the day, the     */
/*  marker and the template differ.                                    */
/*                                                                     */
/*  `dueTodaySentFor` is a separate marker from `dueReminderSentFor`   */
/*  on purpose. The same task is legitimately mailed about twice —     */
/*  once the evening before as "due tomorrow", once this morning as    */
/*  "due today" — and one shared field would let whichever ran first   */
/*  silence the other. Two fields make each run idempotent within      */
/*  itself and independent of the other, which is what protects a      */
/*  retry inside the same day from sending twice.                      */
/* ------------------------------------------------------------------ */

export type DueTodayRunResult = DueMailRunResult;

/**
 * Sends the due-today digests for one run.
 *
 * `dryRun` does every lookup and every filter but sends nothing and marks
 * nothing — the way to see what the next run would do without spending a
 * send on it.
 */
export async function runDueTodayDigest(options?: {
  now?: Date;
  dryRun?: boolean;
}): Promise<DueTodayRunResult> {
  return runDueMailer(
    {
      targetKeyFor: sastDayKey,
      markerField: "dueTodaySentFor",
      preferenceKey: "dueTodayDigest",
      optOutReason: "due-today digest disabled",
      send: sendDueTodayDigest,
    },
    options
  );
}
