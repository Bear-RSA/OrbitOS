import { describe, expect, it } from "vitest";
import {
  JOIN_WINDOW_AFTER_MS,
  JOIN_WINDOW_BEFORE_MS,
  canAnswerCall,
  canJoinScheduledCall,
  canStartDirectCall,
  canWalkIn,
  type ScheduledCallFacts,
  type WalkInFacts,
} from "@/lib/calls/access";

/* ------------------------------------------------------------------ */
/*  Call access                                                        */
/*                                                                     */
/*  These functions stand between a URL and a live microphone in       */
/*  somebody's meeting, so the tests that matter are the refusals.     */
/* ------------------------------------------------------------------ */

const NOW = new Date("2026-09-03T10:00:00Z").getTime();
const HOUR = 3_600_000;

const scheduled = (over: Partial<ScheduledCallFacts> = {}): ScheduledCallFacts => ({
  callProvider: "orbit",
  roomId: "r_000000000000000000000000",
  cancelled: false,
  startAtMs: NOW,
  endAtMs: NOW + HOUR,
  onTheList: true,
  ...over,
});

describe("joining a scheduled call", () => {
  it("lets an invited attendee in during the meeting", () => {
    expect(canJoinScheduledCall(scheduled(), NOW).allowed).toBe(true);
  });

  it("lets them in shortly before it starts", () => {
    const at = NOW - JOIN_WINDOW_BEFORE_MS + 1_000;
    expect(canJoinScheduledCall(scheduled(), at).allowed).toBe(true);
  });

  it("refuses someone who is not on the engagement", () => {
    const d = canJoinScheduledCall(scheduled({ onTheList: false }), NOW);
    expect(d.allowed).toBe(false);
    expect(d).toMatchObject({ reason: "not-invited" });
  });

  it("refuses an engagement that is not an Orbit call", () => {
    expect(canJoinScheduledCall(scheduled({ callProvider: "external" }), NOW)).toMatchObject({
      allowed: false,
      reason: "not-a-call",
    });
  });

  it("refuses when there is no room, even if marked as a call", () => {
    expect(canJoinScheduledCall(scheduled({ roomId: null }), NOW)).toMatchObject({
      allowed: false,
      reason: "not-a-call",
    });
  });

  it("refuses a cancelled engagement", () => {
    expect(canJoinScheduledCall(scheduled({ cancelled: true }), NOW)).toMatchObject({
      allowed: false,
      reason: "ended",
    });
  });

  it("refuses long before the start", () => {
    expect(canJoinScheduledCall(scheduled(), NOW - 2 * HOUR)).toMatchObject({
      allowed: false,
      reason: "not-started",
    });
  });

  it("closes the door after the grace period", () => {
    const at = NOW + HOUR + JOIN_WINDOW_AFTER_MS + 1_000;
    expect(canJoinScheduledCall(scheduled(), at)).toMatchObject({
      allowed: false,
      reason: "ended",
    });
  });

  it("still allows a meeting that has run over, within the grace period", () => {
    const at = NOW + HOUR + JOIN_WINDOW_AFTER_MS - 1_000;
    expect(canJoinScheduledCall(scheduled(), at).allowed).toBe(true);
  });
});

const walkIn = (over: Partial<WalkInFacts> = {}): WalkInFacts => ({
  ...scheduled({ onTheList: false }),
  callActive: true,
  maxGuests: -1,
  ...over,
});

describe("walking in off a link", () => {
  it("lets a stranger in while the call is live", () => {
    expect(canWalkIn(walkIn(), NOW).allowed).toBe(true);
  });

  it("refuses before anyone has started the call", () => {
    // This is what stops a forwarded link being a standing invitation.
    expect(canWalkIn(walkIn({ callActive: false }), NOW)).toMatchObject({
      allowed: false,
      reason: "not-started",
    });
  });

  it("refuses when the plan allows no outside guests", () => {
    expect(canWalkIn(walkIn({ maxGuests: 0 }), NOW)).toMatchObject({
      allowed: false,
      reason: "tier",
    });
  });

  it("refuses after the call has ended", () => {
    const at = NOW + HOUR + JOIN_WINDOW_AFTER_MS + 1_000;
    expect(canWalkIn(walkIn(), at)).toMatchObject({ allowed: false, reason: "ended" });
  });

  it("refuses a cancelled engagement even while marked active", () => {
    expect(canWalkIn(walkIn({ cancelled: true }), NOW)).toMatchObject({
      allowed: false,
      reason: "ended",
    });
  });
});

const direct = (over = {}) => ({
  callerOrgId: "org_1",
  targetOrgId: "org_1",
  callerUid: "uid_a",
  targetUid: "uid_b",
  maxParticipants: -1,
  activeDirectCalls: 0,
  hardMaxConcurrent: 10,
  ...over,
});

describe("starting a direct call", () => {
  it("allows two members of one workspace", () => {
    expect(canStartDirectCall(direct()).allowed).toBe(true);
  });

  it("refuses across workspaces", () => {
    // The whole security model for direct calls.
    expect(canStartDirectCall(direct({ targetOrgId: "org_2" }))).toMatchObject({
      allowed: false,
      reason: "not-invited",
    });
  });

  it("refuses when the caller has no workspace", () => {
    expect(
      canStartDirectCall(direct({ callerOrgId: "", targetOrgId: "" }))
    ).toMatchObject({ allowed: false, reason: "not-invited" });
  });

  it("refuses calling yourself", () => {
    expect(canStartDirectCall(direct({ targetUid: "uid_a" }))).toMatchObject({
      allowed: false,
      reason: "not-invited",
    });
  });

  it("refuses when the workspace is at its concurrency ceiling", () => {
    expect(
      canStartDirectCall(direct({ activeDirectCalls: 10, hardMaxConcurrent: 10 }))
    ).toMatchObject({ allowed: false, reason: "tier" });
  });

  it("refuses a tier that allows fewer than two in a room", () => {
    expect(canStartDirectCall(direct({ maxParticipants: 1 }))).toMatchObject({
      allowed: false,
      reason: "tier",
    });
  });

  it("allows a tier capped at exactly two", () => {
    expect(canStartDirectCall(direct({ maxParticipants: 2 })).allowed).toBe(true);
  });
});

describe("answering", () => {
  it("allows a live ring", () => {
    expect(canAnswerCall("ringing", NOW + 30_000, NOW).allowed).toBe(true);
  });

  it("refuses a ring that timed out", () => {
    // The reason no cleanup cron is needed.
    expect(canAnswerCall("ringing", NOW - 1_000, NOW)).toMatchObject({
      allowed: false,
      reason: "ended",
    });
  });

  it("allows rejoining a call already answered", () => {
    expect(canAnswerCall("active", 0, NOW).allowed).toBe(true);
  });

  it("refuses a declined call", () => {
    expect(canAnswerCall("declined", NOW + 30_000, NOW).allowed).toBe(false);
  });

  it("refuses an ended call", () => {
    expect(canAnswerCall("ended", NOW + 30_000, NOW).allowed).toBe(false);
  });

  it("refuses a missed call", () => {
    expect(canAnswerCall("missed", NOW + 30_000, NOW).allowed).toBe(false);
  });
});
