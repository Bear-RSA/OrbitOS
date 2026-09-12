import { describe, expect, it } from "vitest";
import { JOIN_WINDOW_AFTER_MS } from "@/lib/calls/access";
import { HARD_MAX_PARTICIPANTS } from "@/lib/calls/ceiling";
import {
  effectiveCallProvider,
  isOrbitCall,
  scheduledCallMinutes,
  scheduledCallPath,
  scheduledCallSeats,
  scheduledCallUrl,
} from "@/lib/calls/scheduled";

process.env.NEXT_PUBLIC_APP_URL = "https://orbit-os.co.za";

/* ------------------------------------------------------------------ */
/*  Scheduled calls                                                    */
/*                                                                     */
/*  The reading of old engagements matters most: every engagement in   */
/*  the database predates `callProvider`, and misreading one sends a   */
/*  person to the wrong place — a sign-in wall for a Zoom link, or a   */
/*  Zoom link for a room that lives here.                              */
/* ------------------------------------------------------------------ */

describe("effectiveCallProvider", () => {
  it("reads a stored value as-is", () => {
    expect(effectiveCallProvider({ callProvider: "orbit" })).toBe("orbit");
    expect(effectiveCallProvider({ callProvider: "none", meetingUrl: "https://x" })).toBe("none");
  });

  it("infers external from a link on an engagement older than the field", () => {
    expect(effectiveCallProvider({ meetingUrl: "https://meet.example/x" })).toBe("external");
  });

  it("infers in-person when there is neither", () => {
    expect(effectiveCallProvider({})).toBe("none");
    expect(effectiveCallProvider({ meetingUrl: null })).toBe("none");
  });
});

describe("isOrbitCall", () => {
  it("needs both the provider and a room", () => {
    expect(isOrbitCall({ callProvider: "orbit", roomId: "r_1" })).toBe(true);
    expect(isOrbitCall({ callProvider: "orbit", roomId: null })).toBe(false);
    expect(isOrbitCall({ callProvider: "external", roomId: "r_1" })).toBe(false);
  });
});

describe("links", () => {
  it("points into the app at the room", () => {
    expect(scheduledCallPath("r_abc")).toBe("/call/r_abc");
    expect(scheduledCallUrl("r_abc")).toBe("https://orbit-os.co.za/call/r_abc");
  });

  it("does not double a trailing slash on the base", () => {
    const real = process.env.NEXT_PUBLIC_APP_URL;
    process.env.NEXT_PUBLIC_APP_URL = "https://orbit-os.co.za/";
    try {
      expect(scheduledCallUrl("r_abc")).toBe("https://orbit-os.co.za/call/r_abc");
    } finally {
      process.env.NEXT_PUBLIC_APP_URL = real;
    }
  });
});

describe("scheduledCallSeats", () => {
  it("sizes the room to the plan, since the list can grow once it exists", () => {
    expect(scheduledCallSeats({ maxParticipants: 4 })).toBe(4);
  });

  it("uses the always-on ceiling when the plan does not narrow it", () => {
    expect(scheduledCallSeats({ maxParticipants: -1 })).toBe(HARD_MAX_PARTICIPANTS);
  });

  it("never builds a room for fewer than two", () => {
    expect(scheduledCallSeats({ maxParticipants: 1 })).toBe(2);
  });
});

describe("scheduledCallMinutes", () => {
  const NOW = Date.parse("2026-09-10T14:00:00Z");

  it("runs to the end of the room's grace period", () => {
    const endAt = NOW + 30 * 60_000;
    expect(scheduledCallMinutes(endAt, NOW)).toBe(30 + JOIN_WINDOW_AFTER_MS / 60_000);
  });

  it("rounds a partial minute up rather than cutting a call short", () => {
    const endAt = NOW + 90_500 - JOIN_WINDOW_AFTER_MS; // 1.5 min + a bit
    expect(scheduledCallMinutes(endAt, NOW)).toBe(2);
  });

  it("never asks for less than a minute", () => {
    expect(scheduledCallMinutes(NOW - 10 * 60 * 60_000, NOW)).toBe(1);
  });
});
