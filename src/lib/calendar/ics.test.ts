import { describe, expect, it } from "vitest";
import { buildCalendar, type IcsEntry } from "@/lib/calendar/ics";

/* ------------------------------------------------------------------ */
/*  iCalendar output                                                   */
/*                                                                     */
/*  This file is what actually reaches Gmail, Outlook and Apple        */
/*  Calendar. When it is wrong the failure is silent — the attachment  */
/*  arrives as an inert file, or the meeting quietly fails to move —   */
/*  so the details clients are strict about are pinned here.           */
/*                                                                     */
/*  Assertions unfold first. A content line over 75 octets is split    */
/*  across a CRLF and a leading space, so searching the raw output for */
/*  a long ATTENDEE line finds nothing even when it is perfectly       */
/*  correct.                                                           */
/* ------------------------------------------------------------------ */

/** Reverses RFC 5545 line folding, so assertions can read whole lines. */
const unfold = (ics: string) => ics.replace(/\r\n /g, "");

const linesOf = (ics: string) => unfold(ics).split("\r\n");

const timed = (over: Partial<IcsEntry> = {}): IcsEntry => ({
  uid: "event-evt1@orbitos",
  summary: "Client review",
  timing: {
    allDay: false,
    start: new Date("2026-09-10T12:00:00Z"),
    end: new Date("2026-09-10T12:30:00Z"),
  },
  ...over,
});

describe("calendar envelope", () => {
  const ics = buildCalendar({ name: "OrbitOS", entries: [timed()] });

  it("opens and closes VCALENDAR", () => {
    expect(linesOf(ics)[0]).toBe("BEGIN:VCALENDAR");
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
  });

  it("uses CRLF throughout, which Outlook enforces", () => {
    expect(/[^\r]\n/.test(ics)).toBe(false);
  });

  it("defaults to PUBLISH, which is what a subscription feed wants", () => {
    expect(linesOf(ics)).toContain("METHOD:PUBLISH");
  });
});

describe("an invitation", () => {
  const ics = buildCalendar({
    name: "OrbitOS",
    method: "REQUEST",
    entries: [
      timed({
        sequence: 2,
        organizer: { name: "Bear Mdlalose", email: "bear@orbit-os.co.za" },
        attendees: [
          {
            name: "Bear Mdlalose",
            email: "bear@orbit-os.co.za",
            partStat: "ACCEPTED",
            rsvp: false,
          },
          { name: "Sarah Klein", email: "sarah@client.com", partStat: "NEEDS-ACTION" },
        ],
      }),
    ],
  });

  const lines = linesOf(ics);
  const attendees = lines.filter((l) => l.startsWith("ATTENDEE"));

  it("declares REQUEST, which is what renders Yes/Maybe/No", () => {
    expect(lines).toContain("METHOD:REQUEST");
  });

  it("carries a stable UID so a resend lands on the existing entry", () => {
    expect(lines).toContain("UID:event-evt1@orbitos");
  });

  it("emits SEQUENCE, without which a reschedule is ignored", () => {
    expect(lines).toContain("SEQUENCE:2");
  });

  it("names an organizer as a mailto", () => {
    expect(lines).toContain("ORGANIZER;CN=Bear Mdlalose:mailto:bear@orbit-os.co.za");
  });

  it("lists the whole room", () => {
    expect(attendees).toHaveLength(2);
  });

  it("does not ask the organizer to answer their own invitation", () => {
    const organizer = attendees.find((l) => l.includes("bear@orbit-os.co.za"))!;

    expect(organizer).toContain("PARTSTAT=ACCEPTED");
    expect(organizer).toContain("RSVP=FALSE");
  });

  it("asks everyone else to answer", () => {
    const guest = attendees.find((l) => l.includes("sarah@client.com"))!;

    expect(guest).toContain("PARTSTAT=NEEDS-ACTION");
    expect(guest).toContain("RSVP=TRUE");
    expect(guest).toContain("ROLE=REQ-PARTICIPANT");
  });

  it("writes instants as UTC", () => {
    expect(lines).toContain("DTSTART:20260910T120000Z");
    expect(lines).toContain("DTEND:20260910T123000Z");
  });

  it("defaults SEQUENCE to 0 when none is given", () => {
    const plain = buildCalendar({ name: "OrbitOS", entries: [timed()] });

    expect(linesOf(plain)).toContain("SEQUENCE:0");
  });
});

describe("escaping", () => {
  it("escapes semicolons and commas in TEXT", () => {
    const ics = buildCalendar({
      name: "OrbitOS",
      entries: [timed({ summary: "Client review; final cut, with notes" })],
    });

    expect(unfold(ics)).toContain("SUMMARY:Client review\\; final cut\\, with notes");
  });

  it("turns a real newline into an escaped one", () => {
    const ics = buildCalendar({
      name: "OrbitOS",
      entries: [timed({ description: "Line one\nLine two" })],
    });

    expect(unfold(ics)).toContain("DESCRIPTION:Line one\\nLine two");
  });

  it("escapes backslashes before anything else", () => {
    const ics = buildCalendar({
      name: "OrbitOS",
      entries: [timed({ summary: "path\\to\\thing" })],
    });

    expect(unfold(ics)).toContain("SUMMARY:path\\\\to\\\\thing");
  });

  it("quotes a CN containing a comma", () => {
    const ics = buildCalendar({
      name: "OrbitOS",
      method: "REQUEST",
      entries: [
        timed({
          organizer: { email: "bear@orbit-os.co.za" },
          attendees: [{ name: "Sarah Klein, Director", email: "sarah@client.com" }],
        }),
      ],
    });

    expect(unfold(ics)).toContain('CN="Sarah Klein, Director"');
  });

  it("drops a double quote from a CN, which has no escape", () => {
    const ics = buildCalendar({
      name: "OrbitOS",
      method: "REQUEST",
      entries: [
        timed({
          organizer: { email: "bear@orbit-os.co.za" },
          attendees: [{ name: 'Sarah "Sass" Klein', email: "sarah@client.com" }],
        }),
      ],
    });

    // Emitting it raw would produce a file that fails to parse.
    expect(unfold(ics)).toContain("CN=Sarah Sass Klein");
  });
});

describe("line folding", () => {
  const longSummary =
    "Quarterly review — strategy, budget — and the roadmap for the coming year ahead";
  const ics = buildCalendar({
    name: "OrbitOS",
    entries: [timed({ summary: longSummary })],
  });

  it("keeps every content line within 75 octets", () => {
    const over = ics
      .split("\r\n")
      .filter((line) => Buffer.byteLength(line, "utf8") > 75);

    expect(over).toEqual([]);
  });

  it("does not split a multi-byte character across a fold", () => {
    // An em dash cut in half arrives as mojibake.
    expect(ics).not.toContain("�");
  });

  it("unfolds back to exactly what went in", () => {
    // Unfolding reverses the fold, not the TEXT escaping, so the comma
    // is still the escaped one the spec asks for.
    const escaped = longSummary.replace(/,/g, "\\,");

    expect(unfold(ics)).toContain(`SUMMARY:${escaped}`);
  });
});

describe("an all-day entry", () => {
  it("uses DATE values with an exclusive end", () => {
    const ics = buildCalendar({
      name: "OrbitOS",
      entries: [
        {
          uid: "u@orbitos",
          summary: "Studio closed",
          timing: { allDay: true, startDate: "2026-09-10", endDate: "2026-09-11" },
        },
      ],
    });

    const lines = linesOf(ics);

    expect(lines).toContain("DTSTART;VALUE=DATE:20260910");
    // The 11th is exclusive: this is a one-day entry, not two.
    expect(lines).toContain("DTEND;VALUE=DATE:20260911");
  });
});

describe("a cancellation", () => {
  const ics = buildCalendar({
    name: "OrbitOS",
    method: "CANCEL",
    entries: [
      timed({
        sequence: 3,
        status: "CANCELLED",
        organizer: { email: "bear@orbit-os.co.za" },
        attendees: [{ email: "sarah@client.com" }],
      }),
    ],
  });

  it("says CANCEL and CANCELLED", () => {
    const lines = linesOf(ics);

    expect(lines).toContain("METHOD:CANCEL");
    expect(lines).toContain("STATUS:CANCELLED");
  });

  it("carries the raised sequence, or clients ignore it", () => {
    expect(linesOf(ics)).toContain("SEQUENCE:3");
  });
});
