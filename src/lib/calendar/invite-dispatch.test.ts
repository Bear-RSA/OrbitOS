import { Timestamp } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FakeFirestore, type Row } from "@/lib/testing/fake-firestore";

/* ------------------------------------------------------------------ */
/*  Invite dispatch                                                    */
/*                                                                     */
/*  The contract worth defending is that this NEVER throws. It runs    */
/*  after the engagement has already committed, so an exception here   */
/*  would surface to the organizer as a failed save for an engagement  */
/*  that is saved and correct — and push them into creating it twice.  */
/*                                                                     */
/*  The other half is the split between who is MAILED and who is       */
/*  LISTED. A dispatch narrowed to one new attendee still has to carry */
/*  the full room in its ATTENDEE lines, or that person's calendar     */
/*  shows a meeting that looks like it is just the two of them.        */
/* ------------------------------------------------------------------ */

/* Set at module scope: `rsvpUrlFor` is exercised for real rather than
   mocked, and it reads these lazily on every call. */
process.env.CALENDAR_FEED_SECRET = "test-secret-at-least-32-characters-long";
process.env.NEXT_PUBLIC_APP_URL = "https://orbit-os.co.za";

const db = new FakeFirestore();
vi.mock("@/lib/firebase/admin", () => ({ adminDb: db }));

interface InviteCall {
  kind: "invite" | "update" | "cancel";
  engagement: { id: string; title: string; sequence: number; timeZone: string };
  organizer: { name: string; email: string };
  orgName?: string;
  attendeeList: { email: string; name?: string; partStat?: string; rsvp?: boolean }[];
  recipient: {
    email: string;
    name: string;
    rsvpUrl: string;
    kind: "member" | "guest";
  };
}

type SendResult = { success: true; id?: string } | { success: false; error: string };

const sendEngagementInvite = vi.fn<(params: InviteCall) => Promise<SendResult>>(
  async () => ({ success: true })
);
vi.mock("@/lib/email/sendEngagementInvite", () => ({ sendEngagementInvite }));

const { dispatchEngagementInvites } = await import(
  "@/lib/calendar/invite-dispatch"
);

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

const EVENT_ID = "evt-1";
const ORG = "org-1";
const ORGANIZER = "u-organizer";

function makeEventDoc(overrides: Row = {}): Row {
  return {
    title: "Client review",
    description: "Quarterly walkthrough",
    startAt: Timestamp.fromDate(new Date("2026-08-25T09:00:00Z")),
    endAt: Timestamp.fromDate(new Date("2026-08-25T10:00:00Z")),
    allDay: false,
    startDateKey: "2026-08-25",
    timeZone: "Africa/Johannesburg",
    location: "Studio A",
    meetingUrl: null,
    attendees: [ORGANIZER, "u1", "u2"],
    rsvp: {},
    guests: [],
    guestRsvp: {},
    sequence: 2,
    ...overrides,
  };
}

function seedUser(uid: string, overrides: Row = {}) {
  db.seed("users", uid, {
    name: `User ${uid}`,
    email: `${uid}@studio.com`,
    orgId: ORG,
    calendarFeedVersion: 0,
    ...overrides,
  });
}

function seedGuestDoc(id: string, overrides: Row = {}) {
  db.seed("guests", id, {
    orgId: ORG,
    email: `${id}@acme.com`,
    name: `Guest ${id}`,
    linkedUid: null,
    tokenVersion: 0,
    ...overrides,
  });
}

function dispatch(event: Row, extra: Record<string, unknown> = {}) {
  return dispatchEngagementInvites({
    eventId: EVENT_ID,
    kind: "invite",
    event,
    organizerUid: ORGANIZER,
    orgId: ORG,
    ...extra,
  } as Parameters<typeof dispatchEngagementInvites>[0]);
}

/** Addresses actually mailed, sorted for stable comparison. */
function mailed(): string[] {
  return sendEngagementInvite.mock.calls
    .map((call) => call[0].recipient.email)
    .sort();
}

function lastCall(): InviteCall {
  return sendEngagementInvite.mock.calls.at(-1)![0];
}

beforeEach(() => {
  db.reset();
  sendEngagementInvite.mockClear();
  sendEngagementInvite.mockImplementation(async () => ({ success: true }));

  db.seed("organizations", ORG, { name: "Orbit Studio" });
  seedUser(ORGANIZER, { name: "Bear" });
  seedUser("u1");
  seedUser("u2");
});

/* ------------------------------------------------------------------ */

describe("dispatchEngagementInvites — who gets mailed", () => {
  it("mails every attendee except the organizer", async () => {
    const report = await dispatch(makeEventDoc());

    // The organizer already has this in the app and on their own feed.
    expect(mailed()).toEqual(["u1@studio.com", "u2@studio.com"]);
    expect(report.sent).toBe(2);
    expect(report.failed).toBe(0);
  });

  it("does nothing when the organizer is the only attendee", async () => {
    const report = await dispatch(makeEventDoc({ attendees: [ORGANIZER] }));

    expect(sendEngagementInvite).not.toHaveBeenCalled();
    expect(report).toEqual({
      sent: 0,
      failed: 0,
      failures: [],
      skippedOverCeiling: 0,
    });
  });

  it("mails guests alongside members", async () => {
    seedGuestDoc("g1");

    const report = await dispatch(makeEventDoc({ guests: ["g1"] }));

    expect(mailed()).toEqual(["g1@acme.com", "u1@studio.com", "u2@studio.com"]);
    expect(report.sent).toBe(3);
  });

  it("narrows the send to newly added people", async () => {
    seedGuestDoc("g1");
    seedGuestDoc("g2");

    await dispatch(makeEventDoc({ guests: ["g1", "g2"] }), {
      kind: "update",
      onlyTo: { uids: ["u2"], guestIds: ["g2"] },
    });

    // u1 and g1 were already on it and are left alone.
    expect(mailed()).toEqual(["g2@acme.com", "u2@studio.com"]);
  });

  it("still lists the whole room when the send is narrowed", async () => {
    seedGuestDoc("g1");

    await dispatch(makeEventDoc({ guests: ["g1"] }), {
      onlyTo: { uids: ["u2"], guestIds: [] },
    });

    const listed = lastCall().attendeeList.map((a) => a.email).sort();
    expect(listed).toEqual([
      "g1@acme.com",
      "u-organizer@studio.com",
      "u1@studio.com",
      "u2@studio.com",
    ]);
  });

  it("skips an attendee whose user record has no email", async () => {
    seedUser("u2", { email: "" });

    const report = await dispatch(makeEventDoc());

    expect(mailed()).toEqual(["u1@studio.com"]);
    expect(report.sent).toBe(1);
  });

  it("skips a guest id with no surviving record", async () => {
    const report = await dispatch(makeEventDoc({ guests: ["g-missing"] }));

    expect(mailed()).toEqual(["u1@studio.com", "u2@studio.com"]);
    expect(report.sent).toBe(2);
  });
});

describe("dispatchEngagementInvites — the .ics payload", () => {
  it("marks the organizer accepted and not expected to answer", async () => {
    await dispatch(makeEventDoc());

    const organizer = lastCall().attendeeList.find(
      (a) => a.email === "u-organizer@studio.com"
    )!;
    expect(organizer.partStat).toBe("ACCEPTED");
    expect(organizer.rsvp).toBe(false);
  });

  it("carries each person's current reply through to PARTSTAT", async () => {
    seedGuestDoc("g1");
    const event = makeEventDoc({
      guests: ["g1"],
      rsvp: { u1: "accepted", u2: "declined" },
      guestRsvp: { g1: "tentative" },
    });

    await dispatch(event);

    const byEmail = Object.fromEntries(
      lastCall().attendeeList.map((a) => [a.email, a.partStat])
    );
    expect(byEmail["u1@studio.com"]).toBe("ACCEPTED");
    expect(byEmail["u2@studio.com"]).toBe("DECLINED");
    expect(byEmail["g1@acme.com"]).toBe("TENTATIVE");
  });

  it("reads an absent reply as NEEDS-ACTION", async () => {
    await dispatch(makeEventDoc({ rsvp: {} }));

    const u1 = lastCall().attendeeList.find((a) => a.email === "u1@studio.com")!;
    expect(u1.partStat).toBe("NEEDS-ACTION");
  });

  it("passes the sequence through so reschedules are not discarded", async () => {
    // A client ignores a resend whose SEQUENCE is not higher than the copy
    // it already holds, so this must be the stored value, not a constant.
    await dispatch(makeEventDoc({ sequence: 7 }));

    expect(lastCall().engagement.sequence).toBe(7);
  });

  it("defaults a missing timezone to UTC rather than sending undefined", async () => {
    await dispatch(makeEventDoc({ timeZone: undefined }));
    expect(lastCall().engagement.timeZone).toBe("UTC");
  });

  it("names the workspace on the invitation", async () => {
    await dispatch(makeEventDoc());
    expect(lastCall().orgName).toBe("Orbit Studio");
  });

  it("gives each recipient their own RSVP link", async () => {
    seedGuestDoc("g1");
    await dispatch(makeEventDoc({ guests: ["g1"] }));

    const urls = sendEngagementInvite.mock.calls.map(
      (call) => call[0].recipient.rsvpUrl
    );

    expect(new Set(urls).size).toBe(urls.length);
    for (const url of urls) {
      expect(url.startsWith("https://orbit-os.co.za/rsvp/")).toBe(true);
    }
  });

  it("tags a guest recipient as a guest", async () => {
    seedGuestDoc("g1");
    await dispatch(makeEventDoc({ attendees: [ORGANIZER], guests: ["g1"] }));

    expect(lastCall().recipient.kind).toBe("guest");
  });
});

describe("dispatchEngagementInvites — failure handling", () => {
  it("names the addresses that failed rather than only counting them", async () => {
    sendEngagementInvite.mockImplementation(async (params) =>
      params.recipient.email === "u2@studio.com"
        ? { success: false, error: "mailbox full" }
        : { success: true }
    );

    const report = await dispatch(makeEventDoc());

    expect(report.sent).toBe(1);
    expect(report.failed).toBe(1);
    // The organizer needs to know WHO to chase.
    expect(report.failures).toEqual([
      { email: "u2@studio.com", error: "mailbox full" },
    ]);
  });

  it("does not throw when the send itself blows up", async () => {
    sendEngagementInvite.mockImplementation(async () => {
      throw new Error("network down");
    });

    // An exception here would look to the organizer like a failed save for
    // an engagement that is already committed and correct.
    const report = await dispatch(makeEventDoc());
    expect(report.sent).toBe(0);
  });

  it("returns an empty report when the organizer record is gone", async () => {
    db.reset();
    db.seed("organizations", ORG, { name: "Orbit Studio" });
    seedUser("u1");

    const report = await dispatch(makeEventDoc());

    expect(sendEngagementInvite).not.toHaveBeenCalled();
    expect(report.sent).toBe(0);
  });

  it("returns an empty report when the organizer has no address to send from", async () => {
    seedUser(ORGANIZER, { email: "" });

    const report = await dispatch(makeEventDoc());

    expect(sendEngagementInvite).not.toHaveBeenCalled();
    expect(report.sent).toBe(0);
  });

  it("survives an org document that no longer exists", async () => {
    db.reset();
    seedUser(ORGANIZER, { name: "Bear" });
    seedUser("u1");
    seedUser("u2");

    const report = await dispatch(makeEventDoc());

    expect(report.sent).toBe(2);
    expect(lastCall().orgName).toBeUndefined();
  });
});

describe("dispatchEngagementInvites — the hard ceiling", () => {
  it("caps recipients and reports the overflow", async () => {
    // 70 attendees plus the organizer, against a ceiling of 60. The schema
    // caps a list at 50; this is the backstop for a caller that gets around
    // it, because every recipient is a real send on a real invoice.
    const uids = Array.from({ length: 70 }, (_, i) => `m${i}`);
    for (const uid of uids) seedUser(uid);

    const report = await dispatch(
      makeEventDoc({ attendees: [ORGANIZER, ...uids] })
    );

    expect(report.sent).toBe(60);
    expect(report.skippedOverCeiling).toBe(10);
    expect(sendEngagementInvite).toHaveBeenCalledTimes(60);
  });

  it("leaves a list under the ceiling untouched", async () => {
    const report = await dispatch(makeEventDoc());
    expect(report.skippedOverCeiling).toBe(0);
  });
});
