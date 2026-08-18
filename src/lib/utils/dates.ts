import { formatDistanceToNow, format, isThisWeek, startOfWeek, eachDayOfInterval, endOfWeek } from "date-fns";

export function formatRelativeTime(date: Date): string {
  return formatDistanceToNow(date, { addSuffix: true });
}

export function formatDate(date: Date): string {
  return format(date, "d MMM yyyy");
}

export function formatShortDate(date: Date): string {
  return format(date, "d MMM");
}

export function isOverdue(dueDate: Date): boolean {
  return dueDate < new Date();
}

export function isInactive(lastUpdatedAt: Date, thresholdHours = 48): boolean {
  const threshold = new Date();
  threshold.setHours(threshold.getHours() - thresholdHours);
  return lastUpdatedAt < threshold;
}

export function getCurrentWeekDays(): Date[] {
  const now = new Date();
  const start = startOfWeek(now, { weekStartsOn: 1 }); // Monday
  const end = endOfWeek(now, { weekStartsOn: 1 }); // Sunday
  return eachDayOfInterval({ start, end });
}

export function getDayLabel(date: Date): string {
  return format(date, "EEEE");
}

export function getShortDayLabel(date: Date): string {
  return format(date, "EEE");
}

export function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

export function isDateThisWeek(date: Date): boolean {
  return isThisWeek(date, { weekStartsOn: 1 });
}

/* ------------------------------------------------------------------ */
/*  Calendar-day keys                                                  */
/*                                                                     */
/*  A due date is a calendar day, not an instant. Stored as an instant */
/*  alone, the day a task lands on depends on who is reading it — a    */
/*  list view hides that, a calendar grid puts it on screen.           */
/*                                                                     */
/*  `dueDateKey` ("YYYY-MM-DD") is therefore the authority on which    */
/*  day a task belongs to. The `dueDate` Timestamp stays alongside it  */
/*  purely so Firestore can sort and range-query. Bucket on the key;   */
/*  never derive a day from the Timestamp when a key is available.     */
/* ------------------------------------------------------------------ */

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** The calendar day a Date falls on, read in the local timezone. */
export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * A date key as a local Date at midday — far enough from either midnight
 * that no DST transition can nudge it onto an adjacent day. Use this for
 * anything that formats or compares a due date on the client.
 */
export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

/**
 * Normalize whatever a form or API handed us into a calendar-day key.
 * `<input type="date">` already sends the canonical form, so it passes
 * through untouched; anything else is parsed as an instant and reduced
 * to the day it falls on. Returns null for empty or unparseable input.
 */
export function coerceDateKey(input: string | null | undefined): string | null {
  if (!input) return null;
  if (DATE_KEY_PATTERN.test(input)) return input;
  const parsed = new Date(input);
  return Number.isNaN(parsed.getTime()) ? null : toDateKey(parsed);
}

/**
 * The instant to store beside a key, for sorting and range queries only:
 * midday UTC, which resolves to the intended calendar day everywhere
 * from UTC-11 through UTC+11. Display always uses the key instead.
 */
export function dateKeyToInstant(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0, 0));
}

/**
 * The calendar day of a stored due date, tolerating documents written
 * before `dueDateKey` existed. The fallback reads the *UTC* day, which
 * is the intended one under both encodings — legacy rows landed on UTC
 * midnight, current rows on UTC midday, and both sit inside the day the
 * author picked.
 */
export function dueDateKeyOf(task: {
  dueDateKey?: string | null;
  dueDate?: { toDate: () => Date } | null;
}): string | null {
  if (task.dueDateKey) return task.dueDateKey;
  if (!task.dueDate) return null;
  return task.dueDate.toDate().toISOString().slice(0, 10);
}
