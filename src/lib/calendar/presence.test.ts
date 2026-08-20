import { describe, expect, it } from "vitest";

import {
  currentEngagement,
  engagementPresenceByMember,
  joinNames,
} from "@/lib/calendar/presence";
import type { OrbitEvent, RsvpStatus } from "@/types/event";

/* ------------------------------------------------------------------ */
/*  Presence                                                           */
/*                                                                     */
/*  Pure module, so no Firestore here — only the two things it holds   */
/*  from a real document are `toMillis` and `toDate`, which is what    */
/*  `stamp` below stands in for.                                       */
/*                                                                     */
/*  What is worth pinning down is the exclusions. Every one of them    */
/*  is the difference between a truthful presence line and telling a   */
/*  colleague someone is busy when they are not.                       */
/* ------------------------------------------------------------------ */

const NOW = new Date("2026-08-20T10:00:00Z");

/** The narrow slice of a Firestore Timestamp this module actually calls. */
function stamp(iso: string) {
  const date = new Date(iso);
  return { toMillis: () => date.getTime(), toDate: () => date };
}

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): OrbitEvent {
  return {
    id: "evt-1",
    orgId: "org-1",
    projectId: null,
    title: "Client review",
    description: "",
    startAt: stamp("2026-08-20T09:30:00Z"),
    endAt: stamp("2026-08-20T10:30:00Z"),
    allDay: false,
    startDateKey: "2026-08-20",
    timeZone: "Africa/Johannesburg",
    location: null,
    meetingUrl: null,
    attendees: ["u1", "u2"],
    rsvp: {} as Record<string, RsvpStatus>,
    guests: [],
    guestRsvp: {} as Record<string, RsvpStatus>,
    guestNames: {},
    sequence: 0,
    status: "confirmed",
    createdBy: "u1",
    createdAt: stamp("2026-08-01T00:00:00Z"),
    updatedAt: stamp("2026-08-01T00:00:00Z"),
    ...overrides,
  } as unknown as OrbitEvent;
}

const NAMES = { u1: "Bear", u2: "Sarah Klein", u3: "Thabo Ndlovu", u4: "Ana Reis" };

describe("joinNames", () => {
  it("returns an empty string for nobody", () => {
    expect(joinNames([])).toBe("");
  });

  it("returns a lone name unadorned", () => {
    expect(joinNames(["Sarah"])).toBe("Sarah");
  });

  it("joins two with `and` rather than a comma", () => {
    expect(joinNames(["Sarah", "Thabo"])).toBe("Sarah and Thabo");
  });

  it("overflows into a count once past the cap", () => {
    expect(joinNames(["Sarah", "Thabo", "Ana"])).toBe("Sarah, Thabo and 1 other");
  });

  it("pluralises the overflow count", () => {
    expect(joinNames(["Sarah", "Thabo", "Ana", "Bear"])).toBe(
      "Sarah, Thabo and 2 others"
    );
  });

  it("honours a raised cap before overflowing", () => {
    expect(joinNames(["Sarah", "Thabo", "Ana"], 3)).toBe("Sarah, Thabo and Ana");
  });
});

describe("currentEngagement", () => {
  it("reports the meeting an attendee is inside", () => {
    const presence = currentEngagement([makeEvent()], "u1", NAMES, NOW);

    expect(presence).not.toBeNull();
    expect(presence!.eventId).toBe("evt-1");
    expect(presence!.title).toBe("Client review");
    expect(presence!.label).toBe("in a meeting with Sarah Klein");
    expect(presence!.endsAt.toISOString()).toBe("2026-08-20T10:30:00.000Z");
  });

  it("returns null when nothing is running", () => {
    expect(currentEngagement([], "u1", NAMES, NOW)).toBeNull();
  });

  it("treats the start as inclusive and the end as exclusive", () => {
    const event = makeEvent();
    const atStart = new Date("2026-08-20T09:30:00Z");
    const atEnd = new Date("2026-08-20T10:30:00Z");

    expect(currentEngagement([event], "u1", NAMES, atStart)).not.toBeNull();
    // The moment it ends, the person is free — otherwise back-to-back
    // meetings would both claim them.
    expect(currentEngagement([event], "u1", NAMES, atEnd)).toBeNull();
  });

  it("ignores a cancelled engagement", () => {
    const event = makeEvent({ status: "cancelled" });
    expect(currentEngagement([event], "u1", NAMES, NOW)).toBeNull();
  });

  it("ignores an all-day block", () => {
    // An all-day marker is not a room somebody is sitting in; counting it
    // would show a person in a meeting from midnight to midnight.
    const event = makeEvent({ allDay: true });
    expect(currentEngagement([event], "u1", NAMES, NOW)).toBeNull();
  });

  it("ignores an engagement the person is not on", () => {
    const event = makeEvent({ attendees: ["u2", "u3"] });
    expect(currentEngagement([event], "u1", NAMES, NOW)).toBeNull();
  });

  it("does not place someone who declined", () => {
    const event = makeEvent({ rsvp: { u1: "declined" } });
    expect(currentEngagement([event], "u1", NAMES, NOW)).toBeNull();
  });

  it("leaves declined attendees out of the room", () => {
    const event = makeEvent({
      attendees: ["u1", "u2", "u3"],
      rsvp: { u2: "declined" },
    });

    const presence = currentEngagement([event], "u1", NAMES, NOW)!;
    expect(presence.withNames).toEqual(["Thabo Ndlovu"]);
  });

  it("picks the soonest-ending meeting when double-booked", () => {
    const long = makeEvent({
      id: "long",
      endAt: stamp("2026-08-20T12:00:00Z"),
    });
    const short = makeEvent({
      id: "short",
      endAt: stamp("2026-08-20T10:15:00Z"),
    });

    const presence = currentEngagement([long, short], "u1", NAMES, NOW)!;
    expect(presence.eventId).toBe("short");
  });

  it("names guests alongside members and flags them", () => {
    const event = makeEvent({
      attendees: ["u1", "u2"],
      guests: ["g1"],
      guestNames: { g1: "Priya Naidoo" },
    });

    const presence = currentEngagement([event], "u1", NAMES, NOW)!;
    expect(presence.withNames).toEqual(["Sarah Klein", "Priya Naidoo"]);
    expect(presence.hasGuests).toBe(true);
    expect(presence.label).toBe("in a meeting with Sarah Klein and Priya Naidoo");
  });

  it("falls back to `Guest` when a name was never captured", () => {
    const event = makeEvent({ attendees: ["u1"], guests: ["g1"], guestNames: {} });

    const presence = currentEngagement([event], "u1", NAMES, NOW)!;
    expect(presence.withNames).toEqual(["Guest"]);
  });

  it("leaves a declined guest out of the room", () => {
    const event = makeEvent({
      guests: ["g1"],
      guestNames: { g1: "Priya Naidoo" },
      guestRsvp: { g1: "declined" },
    });

    const presence = currentEngagement([event], "u1", NAMES, NOW)!;
    expect(presence.withNames).toEqual(["Sarah Klein"]);
    expect(presence.hasGuests).toBe(false);
  });

  it("drops an attendee with no known name rather than rendering a uid", () => {
    const event = makeEvent({ attendees: ["u1", "u2", "unknown-uid"] });

    const presence = currentEngagement([event], "u1", NAMES, NOW)!;
    expect(presence.withNames).toEqual(["Sarah Klein"]);
  });

  it("says `in a meeting` when it is the only person left in the room", () => {
    const event = makeEvent({ attendees: ["u1"] });

    const presence = currentEngagement([event], "u1", NAMES, NOW)!;
    expect(presence.withNames).toEqual([]);
    expect(presence.label).toBe("in a meeting");
    expect(presence.hasGuests).toBe(false);
  });

  it("tolerates documents written before guests existed", () => {
    // Older engagements have no `guests`/`guestRsvp`/`rsvp` fields at all.
    const legacy = makeEvent({
      rsvp: undefined,
      guests: undefined,
      guestRsvp: undefined,
      guestNames: undefined,
    });

    const presence = currentEngagement([legacy], "u1", NAMES, NOW)!;
    expect(presence.withNames).toEqual(["Sarah Klein"]);
    expect(presence.hasGuests).toBe(false);
  });
});

describe("engagementPresenceByMember", () => {
  it("keys results by uid and omits anyone free", () => {
    const meeting = makeEvent({ attendees: ["u1", "u2"] });

    const result = engagementPresenceByMember(
      [meeting],
      ["u1", "u2", "u3"],
      NAMES,
      NOW
    );

    expect(Object.keys(result).sort()).toEqual(["u1", "u2"]);
    expect(result.u1.label).toBe("in a meeting with Sarah Klein");
    expect(result.u2.label).toBe("in a meeting with Bear");
    expect(result.u3).toBeUndefined();
  });

  it("returns an empty map when the roster is entirely free", () => {
    expect(engagementPresenceByMember([], ["u1", "u2"], NAMES, NOW)).toEqual({});
  });
});
