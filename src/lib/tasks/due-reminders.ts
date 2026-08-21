import { sendTaskReminder } from "@/lib/email/sendTaskReminder";
import { runDueMailer, type DueMailRunResult } from "@/lib/tasks/due-mailer";
import { sastNextDayKey } from "@/lib/utils/sast";

/* ------------------------------------------------------------------ */
/*  Due-soon task reminders                                            */
/*                                                                     */
/*  Runs once a day and mails every assignee whose work falls due the  */
/*  NEXT calendar day. Work with NOBODY assigned goes to the workspace */
/*  owner instead: an unclaimed task due tomorrow is a planning gap,   */
/*  and the owner is the one person positioned to hand it to somebody  */
/*  before the day arrives.                                            */
/*                                                                     */
/*  The selection, grouping, ceilings and idempotency all live in      */
/*  `due-mailer`, shared with the 06:00 due-today digest. What is      */
/*  specific to this run is only the day it asks about, the marker it  */
/*  writes, and the template it sends.                                 */
/*                                                                     */
/*  The reminder goes out at 09:00 SAST, which is roughly a day of     */
/*  notice rather than exactly 24 hours — a due date is a calendar     */
/*  day, not an instant, so there is no hour to be exact about. Move   */
/*  the schedule in vercel.json and the lead time moves with it; the   */
/*  selection stays "due tomorrow".                                    */
/*                                                                     */
/*  Idempotency lives on the task as `dueReminderSentFor`, holding the */
/*  due-date key already reminded about. A re-run of the same day is a */
/*  no-op; moving a task to a different day makes the value stale and  */
/*  earns a fresh reminder.                                            */
/* ------------------------------------------------------------------ */

export type ReminderRunResult = DueMailRunResult;

/**
 * Sends the reminders for one run.
 *
 * `dryRun` does every lookup and every filter but sends nothing and marks
 * nothing — the way to see what the next run would do without spending a
 * send on it.
 */
export async function runDueTaskReminders(options?: {
  now?: Date;
  dryRun?: boolean;
}): Promise<ReminderRunResult> {
  return runDueMailer(
    {
      targetKeyFor: sastNextDayKey,
      markerField: "dueReminderSentFor",
      preferenceKey: "taskReminders",
      optOutReason: "reminders disabled",
      send: sendTaskReminder,
    },
    options
  );
}
