import { describe, expect, it } from "vitest";
import type { Timestamp } from "firebase/firestore";
import type { OrbitEvent } from "@/types/event";
import {
  diffEngagement,
  durationLabel,
  valuesFor,
  vetGuest,
  type FormShape,
} from "@/lib/events/engagement-form";

/* ------------------------------------------------------------------ */
/*  Engagement form logic                                              */
/*                                                                     */
/*  `diffEngagement` decides who gets emailed. A mistake in it is not  */
/*  a visual bug — it is either a save that silently does nothing, or  */
/*  an unwanted invitation in a client's inbox. Neither is visible in  */
/*  a screenshot, which is why this is tested rather than clicked.     */
/*                                                                     */
/*  `materially` must stay in step with `materiallyChanged` in         */
/*  `actions/events`. If that rule moves, these move with it.          */
/* ------------------------------------------------------------------ */

/** Only `toDate()` is ever read off these. */
const ts = (date: Date) => ({ toDate: () => date }) as unknown as Timestamp;

const START = new Date(2026, 8, 10, 14, 0, 0, 0); // Thu 10 Sep 2026, 14:00 local
const END = new Date(2026, 8, 10, 14, 30, 0, 0);

const EVENT = {
  id: "evt1",
  createdBy: "organizer",
  title: "Client review",
  description: "Go through the cut",
  startAt: ts(START),
  endAt: ts(END),
  allDay: false,
  location: "Studio B",
  meetingUrl: null,
  attendees: ["organizer", "alice"],
  guests: ["g_sarah"],
} as unknown as OrbitEvent;

const STORED_GUESTS = ["sarah@client.com"];

const base = valuesFor(EVENT, null);

/** The form as loaded, with `overrides` applied on top. */
function diff(overrides: Partial<FormShape>, guestsEditable = true) {
  const values: FormShape = { ...base, guests: STORED_GUESTS, ...overrides };
  return diffEngagement(EVENT, values, STORED_GUESTS, guestsEditable);
}

describe("valuesFor", () => {
  it("reads the engagement back into the form", () => {
    expect(base.title).toBe("Client review");
    expect(base.description).toBe("Go through the cut");
    expect(base.location).toBe("Studio B");
    expect(base.startTime).toBe("14:00");
    expect(base.durationMins).toBe(30);
  });

  it("leaves the organizer out of the attendee chips", () => {
    // They are implicit, the server re-adds them on every write, and a
    // removable chip would offer a removal that silently does nothing.
    expect(base.attendees).toEqual(["alice"]);
  });

  it("starts guests empty, since they load separately", () => {
    expect(base.guests).toEqual([]);
  });

  it("falls back to sensible defaults with no engagement", () => {
    const fresh = valuesFor(null, "2026-09-10");

    expect(fresh.date).toBe("2026-09-10");
    expect(fresh.startTime).toBe("09:00");
    expect(fresh.durationMins).toBe(30);
    expect(fresh.attendees).toEqual([]);
  });

  it("hosts a new engagement here by default", () => {
    expect(valuesFor(null, null).callProvider).toBe("orbit");
    expect(valuesFor(null, null).meetingUrl).toBe("");
  });

  it("reads an engagement older than calling as in person or elsewhere", () => {
    expect(base.callProvider).toBe("none");
    expect(
      valuesFor({ ...EVENT, meetingUrl: "https://meet.example/x" }, null).callProvider
    ).toBe("external");
  });

  it("does not load an Orbit call's link into the editable field", () => {
    const orbit = valuesFor(
      { ...EVENT, callProvider: "orbit", roomId: "r_1", meetingUrl: "https://orbit/call/r_1" },
      null
    );

    expect(orbit.callProvider).toBe("orbit");
    expect(orbit.meetingUrl).toBe("");
  });
});

describe("nothing changed", () => {
  it("produces no patch at all", () => {
    const result = diff({});

    expect(result.hasChanges).toBe(false);
    expect(result.materially).toBe(false);
    expect(result.patch).toEqual({});
  });
});

describe("changes that must NOT re-invite anyone", () => {
  it("treats a description edit as non-material", () => {
    const result = diff({ description: "New agenda" });

    expect(result.hasChanges).toBe(true);
    expect(result.materially).toBe(false);
    // Only the field that moved travels, or the server re-invites the room.
    expect(Object.keys(result.patch)).toEqual(["description"]);
  });

  it("treats adding an attendee as non-material", () => {
    const result = diff({ attendees: ["alice", "bob"] });

    expect(result.materially).toBe(false);
    expect(result.added).toBe(1);
    expect(result.removed).toBe(0);
  });

  it("sends the attendee list without the organizer", () => {
    expect(diff({ attendees: ["alice", "bob"] }).patch.attendees).toEqual(["alice", "bob"]);
  });
});

describe("changes that must re-invite everyone", () => {
  it("is material when the start moves", () => {
    const result = diff({ startTime: "16:00" });

    expect(result.materially).toBe(true);
    expect(result.patch.startAt).toBeDefined();
    expect(result.patch.endAt).toBeDefined();
    // Whoever sets the clock sets the zone it was meant in.
    expect(result.patch.timeZone).toBeDefined();
  });

  it("moves the end but not the start when only the duration changes", () => {
    const result = diff({ durationMins: 60 });

    expect(result.materially).toBe(true);
    expect(new Date(result.patch.startAt!).getTime()).toBe(START.getTime());
    expect(new Date(result.patch.endAt!).getTime() - START.getTime()).toBe(60 * 60_000);
  });

  it.each([
    ["title", { title: "Client review v2" }],
    ["location", { location: "Studio C" }],
    ["meeting link", { callProvider: "external", meetingUrl: "https://meet.example/x" }],
    ["where it is hosted", { callProvider: "orbit" }],
    ["all-day", { allDay: true }],
  ])("is material when the %s changes", (_label, override) => {
    expect(diff(override as Partial<FormShape>).materially).toBe(true);
  });

  it("does not disturb the attendee list while rescheduling", () => {
    expect(diff({ startTime: "16:00" }).patch.attendees).toBeUndefined();
  });

  it("gives an all-day engagement an exclusive next-midnight end", () => {
    const result = diff({ allDay: true });
    const span =
      new Date(result.patch.endAt!).getTime() - new Date(result.patch.startAt!).getTime();

    expect(span).toBe(86_400_000);
  });
});

describe("clearing a field", () => {
  it("sends null rather than an empty string", () => {
    // The action writes what it is given; "" would store an empty
    // location instead of removing it.
    expect(diff({ location: "" }).patch.location).toBeNull();
    expect(diff({ location: "   " }).patch.location).toBeNull();
  });
});

describe("where the meeting is", () => {
  const ORBIT = {
    ...EVENT,
    callProvider: "orbit",
    roomId: "r_1",
    meetingUrl: "https://orbit/call/r_1",
  } as OrbitEvent;

  it("sends the provider and the link when moving elsewhere", () => {
    const result = diff({ callProvider: "external", meetingUrl: "https://meet.example/x" });

    expect(result.patch.callProvider).toBe("external");
    expect(result.patch.meetingUrl).toBe("https://meet.example/x");
  });

  it("sends only the provider when moving to an Orbit call", () => {
    // The link is the server's to issue.
    const result = diff({ callProvider: "orbit" });

    expect(result.patch.callProvider).toBe("orbit");
    expect(result.patch.meetingUrl).toBeUndefined();
  });

  it("does not carry a stale link along when the meeting is not elsewhere", () => {
    /* The field is hidden for these, but a value can still be sitting in
       it from before the switch. Sending it would let a typed URL ride
       along under a provider that ignores it. */
    expect(diff({ callProvider: "none", meetingUrl: "https://left.over" }).patch.meetingUrl)
      .toBeUndefined();
    expect(diff({ callProvider: "orbit", meetingUrl: "https://left.over" }).patch.meetingUrl)
      .toBeUndefined();
  });

  it("is a no-op when an Orbit call is reopened and saved untouched", () => {
    const values: FormShape = { ...valuesFor(ORBIT, null), guests: STORED_GUESTS };
    const result = diffEngagement(ORBIT, values, STORED_GUESTS, true);

    expect(result.hasChanges).toBe(false);
  });

  it("only diffs the link against a link the organizer typed", () => {
    /* Moving an Orbit call elsewhere: the stored link is the room's, so
       the typed one is new even if — by coincidence — it were the same. */
    const values: FormShape = {
      ...valuesFor(ORBIT, null),
      guests: STORED_GUESTS,
      callProvider: "external",
      meetingUrl: "https://meet.example/x",
    };
    const result = diffEngagement(ORBIT, values, STORED_GUESTS, true);

    expect(result.patch.callProvider).toBe("external");
    expect(result.patch.meetingUrl).toBe("https://meet.example/x");
    expect(result.materially).toBe(true);
  });
});

describe("guests", () => {
  it("counts an added address and sends the whole list", () => {
    const result = diff({ guests: ["sarah@client.com", "new@client.com"] });

    expect(result.added).toBe(1);
    expect(result.patch.guests).toEqual([
      { email: "sarah@client.com" },
      { email: "new@client.com" },
    ]);
  });

  it("counts a dropped address as a removal", () => {
    const result = diff({ guests: [] });

    expect(result.removed).toBe(1);
    expect(result.patch.guests).toEqual([]);
  });

  it("omits guests entirely while the stored list is still loading", () => {
    /* The server REPLACES the guest list with whatever it is sent. Posting
       a half-known list would drop the guests that had not arrived yet and
       mail each of them a cancellation on the way out. */
    const result = diffEngagement(EVENT, { ...base, guests: [] }, [], false);

    expect(result.patch.guests).toBeUndefined();
    expect(result.removed).toBe(0);
    expect(result.hasChanges).toBe(false);
  });
});

describe("removals", () => {
  it("counts an attendee taken off", () => {
    const result = diff({ attendees: [] });

    expect(result.removed).toBe(1);
    expect(result.added).toBe(0);
  });

  it("counts people added and removed in the same edit", () => {
    const result = diff({ attendees: ["bob"], guests: [] });

    expect(result.added).toBe(1); // bob
    expect(result.removed).toBe(2); // alice + the guest
  });
});

describe("vetGuest", () => {
  it("accepts and normalizes an address", () => {
    expect(vetGuest("  Sarah@Client.com ", [])).toEqual({ email: "sarah@client.com" });
  });

  it("ignores an empty field without calling it an error", () => {
    expect(vetGuest("   ", [])).toEqual({});
  });

  it.each(["notanemail", "missing@domain", "@nolocal.com", "two words@x.com"])(
    "rejects %s",
    (value) => {
      expect(vetGuest(value, []).error).toBeDefined();
    }
  );

  it("rejects an address already on the list", () => {
    expect(vetGuest("sarah@client.com", ["sarah@client.com"]).error).toBeDefined();
  });

  it("rejects once the guest ceiling is reached", () => {
    const full = Array.from({ length: 25 }, (_, i) => `guest${i}@example.com`);

    expect(vetGuest("one.more@example.com", full).error).toBeDefined();
  });
});

describe("durationLabel", () => {
  it.each([
    [45, "45 min"],
    [60, "1 hr"],
    [90, "1 hr 30 min"],
    [120, "2 hrs"],
    [240, "4 hrs"],
  ])("renders %i as %s", (mins, expected) => {
    expect(durationLabel(mins)).toBe(expected);
  });
});
