import { describe, expect, it } from "vitest";
import {
  canRequestTranscript,
  consentWindowOpen,
  hasMajority,
  majorityUnreachable,
  resolveConsentOutcome,
  shouldCapture,
  tallyConsent,
  type ConsentRecord,
} from "@/lib/transcripts/consent";

/* ------------------------------------------------------------------ */
/*  Consent                                                            */
/*                                                                     */
/*  Every test here is about the direction that records somebody who   */
/*  did not agree. A majority that is too easy to reach is the only    */
/*  bug in this file that matters.                                     */
/* ------------------------------------------------------------------ */

const accepted: ConsentRecord = { decision: "accepted" };
const declined: ConsentRecord = { decision: "declined" };

describe("majority", () => {
  it("needs both people in a call between two", () => {
    expect(hasMajority(1, 2)).toBe(false);
    expect(hasMajority(2, 2)).toBe(true);
  });

  it("is strict rather than half-or-more", () => {
    expect(hasMajority(2, 4)).toBe(false);
    expect(hasMajority(3, 4)).toBe(true);
  });

  it("takes two of three and three of five", () => {
    expect(hasMajority(2, 3)).toBe(true);
    expect(hasMajority(1, 3)).toBe(false);
    expect(hasMajority(3, 5)).toBe(true);
    expect(hasMajority(2, 5)).toBe(false);
  });

  it("refuses a room with nobody in it", () => {
    expect(hasMajority(0, 0)).toBe(false);
    expect(hasMajority(1, 0)).toBe(false);
  });

  it("does not let a non-number carry a vote", () => {
    expect(hasMajority(Number.NaN, 2)).toBe(false);
    expect(hasMajority(Number.POSITIVE_INFINITY, Number.NaN)).toBe(false);
  });
});

describe("unreachable majority", () => {
  it("is settled once half the room has refused", () => {
    expect(majorityUnreachable(2, 4)).toBe(true);
    expect(majorityUnreachable(1, 4)).toBe(false);
  });

  it("is settled by one refusal in a call between two", () => {
    expect(majorityUnreachable(1, 2)).toBe(true);
  });
});

describe("tally", () => {
  it("counts both sides and what is still outstanding", () => {
    const tally = tallyConsent({ a: accepted, b: declined }, 4);
    expect(tally).toEqual({ accepted: 1, declined: 1, responded: 2, outstanding: 2 });
  });

  it("treats a missing map as nobody having answered", () => {
    expect(tallyConsent(null, 3).outstanding).toBe(3);
  });

  it("never reports negative outstanding when more answered than were counted", () => {
    const tally = tallyConsent({ a: accepted, b: accepted, c: accepted }, 2);
    expect(tally.outstanding).toBe(0);
  });
});

describe("the window", () => {
  it("is open before the deadline and shut after it", () => {
    expect(consentWindowOpen(1_000, 999)).toBe(true);
    expect(consentWindowOpen(1_000, 1_000)).toBe(false);
    expect(consentWindowOpen(1_000, 1_001)).toBe(false);
  });

  it("is shut when there is no deadline to read", () => {
    expect(consentWindowOpen(Number.NaN, 0)).toBe(false);
  });
});

describe("outcome", () => {
  const deadlineMillis = 10_000;

  it("stays pending while the room is still deciding", () => {
    expect(
      resolveConsentOutcome({
        consent: { a: accepted },
        headcount: 4,
        deadlineMillis,
        now: 0,
      })
    ).toBe("pending");
  });

  it("starts recording the moment a majority accepts", () => {
    expect(
      resolveConsentOutcome({
        consent: { a: accepted, b: accepted, c: accepted },
        headcount: 4,
        deadlineMillis,
        now: 0,
      })
    ).toBe("recording");
  });

  it("declines as soon as a majority is out of reach, without waiting", () => {
    expect(
      resolveConsentOutcome({
        consent: { a: accepted, b: declined, c: declined },
        headcount: 4,
        deadlineMillis,
        now: 0,
      })
    ).toBe("declined");
  });

  it("treats silence as a no once the window closes", () => {
    expect(
      resolveConsentOutcome({
        consent: { a: accepted },
        headcount: 4,
        deadlineMillis,
        now: deadlineMillis + 1,
      })
    ).toBe("declined");
  });

  it("still honours a majority that arrived before the deadline lapsed", () => {
    expect(
      resolveConsentOutcome({
        consent: { a: accepted, b: accepted },
        headcount: 2,
        deadlineMillis,
        now: deadlineMillis + 5_000,
      })
    ).toBe("recording");
  });
});

describe("asking", () => {
  it("lets a participant ask when nothing has been asked yet", () => {
    expect(canRequestTranscript({ existing: null, isParticipant: true }).allowed).toBe(true);
  });

  it("refuses somebody who is not in the call", () => {
    expect(canRequestTranscript({ existing: null, isParticipant: false }).allowed).toBe(false);
  });

  it("refuses a second ask while the first is still out", () => {
    expect(
      canRequestTranscript({ existing: { status: "pending" }, isParticipant: true }).allowed
    ).toBe(false);
  });

  it("does not re-ask a room that already said no", () => {
    const decision = canRequestTranscript({
      existing: { status: "declined" },
      isParticipant: true,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.message).toMatch(/decided against/i);
  });

  it("refuses when the call is already being transcribed", () => {
    expect(
      canRequestTranscript({ existing: { status: "recording" }, isParticipant: true }).allowed
    ).toBe(false);
  });
});

describe("who captures", () => {
  it("captures only for someone who accepted, while recording", () => {
    expect(shouldCapture({ status: "recording", ownDecision: "accepted" })).toBe(true);
  });

  it("never captures someone who declined, even in a recorded call", () => {
    expect(shouldCapture({ status: "recording", ownDecision: "declined" })).toBe(false);
  });

  it("never captures someone who has not answered", () => {
    expect(shouldCapture({ status: "recording", ownDecision: null })).toBe(false);
  });

  it("never captures before the room has agreed", () => {
    expect(shouldCapture({ status: "pending", ownDecision: "accepted" })).toBe(false);
  });
});
