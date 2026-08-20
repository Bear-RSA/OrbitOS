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
/*                                                                     */
/*  METHOD decides how a client reads the file, and the difference is  */
/*  the whole feature:                                                 */
/*                                                                     */
/*    PUBLISH — "here is some information". What the subscription      */
/*    feed sends. No RSVP, no reply, nothing to answer.                */
/*                                                                     */
/*    REQUEST — "you are invited". This is what makes Gmail and        */
/*    Outlook render Yes/Maybe/No above the message instead of an      */
/*    inert attachment. It is only valid with an ORGANIZER and at      */
/*    least one ATTENDEE, so those are required by the type below      */
/*    rather than left to a runtime surprise.                          */
/*                                                                     */
/*    CANCEL — "it is off". Clients pull the entry from the grid.      */
/*                                                                     */
/*  SEQUENCE is the other half of REQUEST/CANCEL. Clients dedupe on    */
/*  UID and IGNORE a resend whose SEQUENCE is not higher than the      */
/*  copy they hold. A reschedule that forgets to bump it looks, from   */
/*  the recipient's calendar, exactly like nothing happening.          */
/* ------------------------------------------------------------------ */

export type IcsTiming =
  /** `startDate`/`endDate` are "YYYY-MM-DD"; `endDate` is exclusive. */
  | { allDay: true; startDate: string; endDate: string }
  | { allDay: false; start: Date; end: Date };

/** How the receiving client should treat the file. */
export type IcsMethod = "PUBLISH" | "REQUEST" | "CANCEL";

/** Maps to PARTSTAT, the participation status a client shows per person. */
export type IcsPartStat = "NEEDS-ACTION" | "ACCEPTED" | "DECLINED" | "TENTATIVE";

export interface IcsPerson {
  name?: string | null;
  email: string;
}

export interface IcsAttendee extends IcsPerson {
  partStat?: IcsPartStat;
  /** False for someone copied in who is not expected to answer. */
  rsvp?: boolean;
  optional?: boolean;
}

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

  /** Required for REQUEST and CANCEL; clients reject those without it. */
  organizer?: IcsPerson | null;
  attendees?: IcsAttendee[];
  /** Must strictly increase across resends of the same UID. Defaults to 0. */
  sequence?: number;
}

export interface CalendarOptions {
  /** Shown as the calendar's name once subscribed. */
  name: string;
  description?: string;
  entries: IcsEntry[];
  /** How often a client should re-fetch. Defaults to 30 minutes. */
  refreshMinutes?: number;
  /** Defaults to PUBLISH, which is what a subscription feed wants. */
  method?: IcsMethod;
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

/**
 * Escaping for a PARAMETER value such as CN, which uses quoting rather
 * than backslashes. A name containing a colon, semicolon, or comma has
 * to be quoted, and a double quote cannot be represented at all — the
 * spec gives no escape for it, so it is dropped rather than emitted to
 * produce a file that fails to parse.
 */
function escapeParam(value: string): string {
  const clean = value.replace(/"/g, "").replace(/[\r\n]+/g, " ").trim();
  return /[:;,]/.test(clean) ? `"${clean}"` : clean;
}

/** `ORGANIZER;CN=Bear:mailto:bear@example.com` */
function organizerLine(person: IcsPerson): string {
  const cn = person.name ? `;CN=${escapeParam(person.name)}` : "";
  return `ORGANIZER${cn}:mailto:${person.email}`;
}

/**
 * One ATTENDEE line. ROLE and RSVP are what tell the client whether to
 * put this person in the "required" list and whether to ask them for an
 * answer; PARTSTAT is what it renders next to their name.
 */
function attendeeLine(attendee: IcsAttendee): string {
  const parts = [
    attendee.name ? `CN=${escapeParam(attendee.name)}` : null,
    `ROLE=${attendee.optional ? "OPT-PARTICIPANT" : "REQ-PARTICIPANT"}`,
    `PARTSTAT=${attendee.partStat ?? "NEEDS-ACTION"}`,
    `RSVP=${attendee.rsvp === false ? "FALSE" : "TRUE"}`,
    "CUTYPE=INDIVIDUAL",
  ].filter(Boolean);

  return `ATTENDEE;${parts.join(";")}:mailto:${attendee.email}`;
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
  method = "PUBLISH",
}: CalendarOptions): string {
  const now = utcStamp(new Date());
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//OrbitOS//Operations Calendar//EN",
    "CALSCALE:GREGORIAN",
    `METHOD:${method}`,
    `X-WR-CALNAME:${escapeText(name)}`,
    `REFRESH-INTERVAL;VALUE=DURATION:PT${refreshMinutes}M`,
    `X-PUBLISHED-TTL:PT${refreshMinutes}M`,
  ];

  if (description) lines.push(`X-WR-CALDESC:${escapeText(description)}`);

  for (const entry of entries) {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${entry.uid}`);
    lines.push(`DTSTAMP:${now}`);
    // Always emitted: an absent SEQUENCE defaults to 0 in some clients and
    // is treated as "unknown" in others, and the difference bites on resend.
    lines.push(`SEQUENCE:${entry.sequence ?? 0}`);

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

    if (entry.organizer) lines.push(organizerLine(entry.organizer));
    for (const attendee of entry.attendees ?? []) lines.push(attendeeLine(attendee));

    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");

  // CRLF is required by the spec, and Outlook enforces it.
  return lines.map(fold).join("\r\n") + "\r\n";
}
