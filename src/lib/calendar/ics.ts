/* ------------------------------------------------------------------ */
/*  iCalendar serialization (RFC 5545)                                 */
/*                                                                     */
/*  Deliberately hand-rolled and small: the feed emits two shapes —    */
/*  an all-day entry for a directive, a timed entry for an engagement  */
/*  — and a dependency would bring a timezone database along for it.   */
/*                                                                     */
/*  The parts that are easy to get wrong and that clients are strict   */
/*  about: CRLF line endings, folding at 75 octets, TEXT escaping,     */
/*  and an all-day DTEND that is exclusive.                            */
/* ------------------------------------------------------------------ */

export type IcsTiming =
  /** `startDate`/`endDate` are "YYYY-MM-DD"; `endDate` is exclusive. */
  | { allDay: true; startDate: string; endDate: string }
  | { allDay: false; start: Date; end: Date };

export interface IcsEntry {
  /** Globally unique and stable across refreshes, or clients duplicate. */
  uid: string;
  summary: string;
  description?: string | null;
  location?: string | null;
  url?: string | null;
  timing: IcsTiming;
  status?: "CONFIRMED" | "CANCELLED";
  categories?: string[];
  lastModified?: Date;
}

export interface CalendarOptions {
  /** Shown as the calendar's name once subscribed. */
  name: string;
  description?: string;
  entries: IcsEntry[];
  /** How often a client should re-fetch. Defaults to 30 minutes. */
  refreshMinutes?: number;
}

/** RFC 5545 TEXT escaping. Order matters — backslash has to go first. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/**
 * Folds a content line to 75 octets, continuing with a leading space.
 * The limit is bytes rather than characters, and a multi-byte sequence
 * must not be split across the fold — an em dash in a title otherwise
 * arrives as mojibake.
 */
function fold(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;

  const pieces: string[] = [];
  let cursor = 0;
  let limit = 75;

  while (cursor < bytes.length) {
    let end = Math.min(cursor + limit, bytes.length);
    // Walk back off any UTF-8 continuation byte (0b10xxxxxx).
    while (end > cursor && end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
    pieces.push(bytes.subarray(cursor, end).toString("utf8"));
    cursor = end;
    limit = 74; // continuation lines spend one octet on the leading space
  }

  return pieces.join("\r\n ");
}

/** UTC instant: 20260818T093000Z */
function utcStamp(date: Date): string {
  return `${date.toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;
}

/** Date value: 20260818 */
function dateStamp(dateKey: string): string {
  return dateKey.replace(/-/g, "");
}

export function buildCalendar({
  name,
  description,
  entries,
  refreshMinutes = 30,
}: CalendarOptions): string {
  const now = utcStamp(new Date());
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//OrbitOS//Operations Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(name)}`,
    `REFRESH-INTERVAL;VALUE=DURATION:PT${refreshMinutes}M`,
    `X-PUBLISHED-TTL:PT${refreshMinutes}M`,
  ];

  if (description) lines.push(`X-WR-CALDESC:${escapeText(description)}`);

  for (const entry of entries) {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${entry.uid}`);
    lines.push(`DTSTAMP:${now}`);

    if (entry.timing.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${dateStamp(entry.timing.startDate)}`);
      lines.push(`DTEND;VALUE=DATE:${dateStamp(entry.timing.endDate)}`);
    } else {
      lines.push(`DTSTART:${utcStamp(entry.timing.start)}`);
      lines.push(`DTEND:${utcStamp(entry.timing.end)}`);
    }

    lines.push(`SUMMARY:${escapeText(entry.summary)}`);
    if (entry.description) lines.push(`DESCRIPTION:${escapeText(entry.description)}`);
    if (entry.location) lines.push(`LOCATION:${escapeText(entry.location)}`);
    if (entry.url) lines.push(`URL:${entry.url}`);
    if (entry.status) lines.push(`STATUS:${entry.status}`);
    if (entry.categories?.length) {
      lines.push(`CATEGORIES:${entry.categories.map(escapeText).join(",")}`);
    }
    if (entry.lastModified) lines.push(`LAST-MODIFIED:${utcStamp(entry.lastModified)}`);

    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");

  // CRLF is required by the spec, and Outlook enforces it.
  return lines.map(fold).join("\r\n") + "\r\n";
}
