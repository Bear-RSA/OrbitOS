import { describe, expect, it } from "vitest";
import { coerceDateKey, dateKeyToInstant, toDateKey, toDateKeyInZone } from "@/lib/utils/dates";

/* ------------------------------------------------------------------ */
/*  Calendar-day keys                                                  */
/*                                                                     */
/*  A date key is the authority on which day something falls on, so    */
/*  reading it in the wrong zone puts an engagement in the wrong cell  */
/*  of the grid and, for an all-day invite, on the wrong date in the   */
/*  recipient's calendar.                                              */
/* ------------------------------------------------------------------ */

describe("toDateKeyInZone", () => {
  /* 23:00 UTC on the 20th is already the 21st in Johannesburg. This is
     the case that was wrong: the server runs in UTC, so a late-evening
     engagement was being filed under the previous day. */
  const lateEvening = new Date("2026-08-20T23:00:00Z");

  it("reads the day in the named zone, not the server's", () => {
    expect(toDateKeyInZone(lateEvening, "Africa/Johannesburg")).toBe("2026-08-21");
    expect(toDateKeyInZone(lateEvening, "Asia/Tokyo")).toBe("2026-08-21");
    expect(toDateKeyInZone(lateEvening, "UTC")).toBe("2026-08-20");
    expect(toDateKeyInZone(lateEvening, "America/Los_Angeles")).toBe("2026-08-20");
  });

  it("handles the other side of midnight", () => {
    // 01:00 UTC is still the previous evening in Los Angeles.
    const earlyMorning = new Date("2026-08-21T01:00:00Z");

    expect(toDateKeyInZone(earlyMorning, "America/Los_Angeles")).toBe("2026-08-20");
    expect(toDateKeyInZone(earlyMorning, "Africa/Johannesburg")).toBe("2026-08-21");
  });

  it("always produces the key format", () => {
    for (const zone of ["UTC", "Africa/Johannesburg", "Pacific/Kiritimati", "America/Sao_Paulo"]) {
      expect(toDateKeyInZone(lateEvening, zone)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("falls back to the local reading for an unknown zone", () => {
    // No worse than what the caller would have done without it.
    expect(toDateKeyInZone(lateEvening, "Not/AZone")).toBe(toDateKey(lateEvening));
  });
});

describe("toDateKey", () => {
  it("reads the local calendar day", () => {
    expect(toDateKey(new Date(2026, 7, 21, 1, 0))).toBe("2026-08-21");
  });

  it("pads single digits", () => {
    expect(toDateKey(new Date(2026, 0, 5, 12, 0))).toBe("2026-01-05");
  });
});

describe("coerceDateKey", () => {
  it("passes a canonical key through untouched", () => {
    expect(coerceDateKey("2026-08-21")).toBe("2026-08-21");
  });

  it("returns null for empty or unparseable input", () => {
    expect(coerceDateKey("")).toBeNull();
    expect(coerceDateKey(null)).toBeNull();
    expect(coerceDateKey("not a date")).toBeNull();
  });
});

describe("dateKeyToInstant", () => {
  it("lands on midday UTC, so the day survives either way round the world", () => {
    const instant = dateKeyToInstant("2026-08-21");

    expect(instant.toISOString()).toBe("2026-08-21T12:00:00.000Z");
    /* Midday UTC reads as the intended day from UTC-11 through UTC+11,
       which is the range the helper documents. Beyond it the day does
       shift — Auckland at UTC+12 sees midnight on the 22nd — so display
       must read the key rather than this instant. */
    expect(toDateKeyInZone(instant, "Pacific/Midway")).toBe("2026-08-21"); // UTC-11
    expect(toDateKeyInZone(instant, "Pacific/Noumea")).toBe("2026-08-21"); // UTC+11
  });
});
