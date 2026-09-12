import { describe, expect, it } from "vitest";
import {
  JOIN_WINDOW_AFTER_MS,
  JOIN_WINDOW_BEFORE_MS,
  canAddToCall,
  canAnswerCall,
  canJoinGroupCall,
  canJoinScheduledCall,
  canStartDirectCall,
  canStartGroupCall,
  canWalkIn,
  groupCallLive,
  type AddToCallFacts,
  type JoinGroupCallFacts,
  type ScheduledCallFacts,
  type StartGroupCallFacts,
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

/* ------------------------------------------------------------------ */
/*  Group calls                                                        */
/*                                                                     */
/*  Nothing rings here, so the refusals are the entire security model: */
/*  a room beside a thread is open to whoever the thread says is in    */
/*  it, and to nobody else.                                            */
/* ------------------------------------------------------------------ */

/** A stand-in for a Firestore Timestamp, which is all these read. */
const at = (ms: number) => ({ toMillis: () => ms });

const startGroup = (
  over: Partial<StartGroupCallFacts> = {}
): StartGroupCallFacts => ({
  conversationType: "group",
  conversationOrgId: "org_1",
  participantIds: ["u_1", "u_2", "u_3"],
  viewerUid: "u_1",
  viewerOrgId: "org_1",
  maxParticipants: 10,
  activeGroupCalls: 0,
  hardMaxConcurrent: 5,
  ...over,
});

const joinGroup = (over: Partial<JoinGroupCallFacts> = {}): JoinGroupCallFacts => ({
  conversationType: "group",
  conversationOrgId: "org_1",
  participantIds: ["u_1", "u_2", "u_3"],
  viewerUid: "u_1",
  viewerOrgId: "org_1",
  maxParticipants: 10,
  live: true,
  occupants: 1,
  seats: 3,
  alreadyIn: false,
  ...over,
});

describe("whether a group call is live", () => {
  it("is live until its deadline", () => {
    expect(groupCallLive({ expiresAt: at(NOW + 1_000) }, NOW)).toBe(true);
  });

  /* The reason no cleanup cron is needed: nobody has to write down that
     a call everyone walked away from is over. */
  it("is over once the deadline passes, however it was left", () => {
    expect(groupCallLive({ expiresAt: at(NOW - 1) }, NOW)).toBe(false);
  });

  it("reads a thread that never had a call as not live", () => {
    expect(groupCallLive(null, NOW)).toBe(false);
    expect(groupCallLive(undefined, NOW)).toBe(false);
  });
});

describe("starting a group call", () => {
  it("lets a member of the group open a room", () => {
    expect(canStartGroupCall(startGroup()).allowed).toBe(true);
  });

  it("refuses somebody who is not in the conversation", () => {
    expect(canStartGroupCall(startGroup({ viewerUid: "u_9" }))).toMatchObject({
      allowed: false,
      reason: "not-invited",
    });
  });

  it("refuses a thread in another workspace", () => {
    expect(canStartGroupCall(startGroup({ viewerOrgId: "org_2" }))).toMatchObject({
      allowed: false,
      reason: "not-invited",
    });
  });

  it("refuses a dm — those ring instead", () => {
    expect(canStartGroupCall(startGroup({ conversationType: "dm" }))).toMatchObject({
      allowed: false,
      reason: "not-a-call",
    });
  });

  it("refuses Town Hall, which is a notice board", () => {
    expect(
      canStartGroupCall(startGroup({ conversationType: "townhall" }))
    ).toMatchObject({ allowed: false, reason: "not-a-call" });
  });

  /* The tier gate, expressed in seats: a plan that seats two seats a
     caller and a callee, which is a direct call by another name. */
  it("refuses a plan that seats only a pair", () => {
    expect(canStartGroupCall(startGroup({ maxParticipants: 2 }))).toMatchObject({
      allowed: false,
      reason: "tier",
    });
  });

  it("allows a plan that seats a third person", () => {
    expect(canStartGroupCall(startGroup({ maxParticipants: 3 })).allowed).toBe(true);
  });

  it("allows a plan that does not narrow the ceiling", () => {
    expect(canStartGroupCall(startGroup({ maxParticipants: -1 })).allowed).toBe(true);
  });

  it("refuses once the workspace is at its concurrency ceiling", () => {
    expect(canStartGroupCall(startGroup({ activeGroupCalls: 5 }))).toMatchObject({
      allowed: false,
      reason: "tier",
    });
  });
});

describe("joining a group call", () => {
  it("lets a member walk into an open room", () => {
    expect(canJoinGroupCall(joinGroup()).allowed).toBe(true);
  });

  it("refuses a call that has ended", () => {
    expect(canJoinGroupCall(joinGroup({ live: false }))).toMatchObject({
      allowed: false,
      reason: "ended",
    });
  });

  it("refuses somebody outside the conversation", () => {
    expect(canJoinGroupCall(joinGroup({ viewerUid: "u_9" }))).toMatchObject({
      allowed: false,
      reason: "not-invited",
    });
  });

  it("refuses a full room", () => {
    expect(canJoinGroupCall(joinGroup({ occupants: 3, seats: 3 }))).toMatchObject({
      allowed: false,
      reason: "tier",
    });
  });

  /* A reconnect is not a thirteenth body. Refusing it would lock people
     out of the call they are already sitting in. */
  it("lets somebody already counted in the room back in when it is full", () => {
    expect(
      canJoinGroupCall(joinGroup({ occupants: 3, seats: 3, alreadyIn: true })).allowed
    ).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  Adding to a direct call                                            */
/* ------------------------------------------------------------------ */

const addTo = (over: Partial<AddToCallFacts> = {}): AddToCallFacts => ({
  callStatus: "active",
  callOrgId: "org_1",
  participants: ["u_a", "u_b"],
  pending: [],
  callerUid: "u_a",
  callerOrgId: "org_1",
  targetUid: "u_c",
  targetOrgId: "org_1",
  seats: 4,
  ...over,
});

describe("adding somebody to a call", () => {
  it("lets a participant ring a teammate into a live call", () => {
    expect(canAddToCall(addTo()).allowed).toBe(true);
  });

  it("refuses a call that is not running", () => {
    expect(canAddToCall(addTo({ callStatus: "ringing" }))).toMatchObject({
      allowed: false,
      reason: "ended",
    });
    expect(canAddToCall(addTo({ callStatus: "ended" }))).toMatchObject({
      allowed: false,
      reason: "ended",
    });
  });

  /* A caller who hung up is one of the call's ends but not in it, and
     is not entitled to keep filling a room they left. */
  it("refuses somebody who is not in the call", () => {
    expect(canAddToCall(addTo({ callerUid: "u_z" }))).toMatchObject({
      allowed: false,
      reason: "not-invited",
    });
  });

  it("refuses a target outside the workspace", () => {
    expect(canAddToCall(addTo({ targetOrgId: "org_2" }))).toMatchObject({
      allowed: false,
      reason: "not-invited",
    });
  });

  it("refuses adding yourself, or somebody already in", () => {
    expect(canAddToCall(addTo({ targetUid: "u_a" })).allowed).toBe(false);
    expect(canAddToCall(addTo({ targetUid: "u_b" })).allowed).toBe(false);
  });

  it("refuses ringing somebody who is already being rung", () => {
    expect(canAddToCall(addTo({ pending: ["u_c"] })).allowed).toBe(false);
  });

  it("counts rings still out against the seats", () => {
    // Two in, one ringing, four seats: room for exactly one more.
    expect(canAddToCall(addTo({ pending: ["u_d"] })).allowed).toBe(true);
    expect(canAddToCall(addTo({ pending: ["u_d", "u_e"] }))).toMatchObject({
      allowed: false,
      reason: "tier",
    });
  });

  it("refuses on a plan that seats only a pair", () => {
    expect(canAddToCall(addTo({ seats: 2 }))).toMatchObject({
      allowed: false,
      reason: "tier",
    });
  });
});
