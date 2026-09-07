import { describe, expect, it } from "vitest";
import {
  HARD_MAX_CHARS_PER_LINE,
  HARD_MAX_SESSIONS_PER_MONTH,
  admitTranscriptSession,
  applyTranscriptDelta,
  cleanLineText,
  readTranscriptUsage,
  transcriptSessionAllowance,
} from "@/lib/transcripts/ceiling";
import { periodKeyFor } from "@/types/transcript";

/* ------------------------------------------------------------------ */
/*  Transcript cost ceilings                                           */
/*                                                                     */
/*  Always on, independent of the paywall, because every utterance is  */
/*  a Firestore write. Every test here is about the direction that     */
/*  costs money: a caller must never ask for MORE than the ceiling and */
/*  be given it.                                                       */
/* ------------------------------------------------------------------ */

describe("session allowance", () => {
  it("passes a tier under the ceiling through", () => {
    expect(transcriptSessionAllowance(20)).toBe(20);
  });

  it("clamps a tier more generous than the ceiling", () => {
    expect(transcriptSessionAllowance(10_000)).toBe(HARD_MAX_SESSIONS_PER_MONTH);
  });

  it("treats -1 as 'the plan does not narrow it', never as unlimited", () => {
    expect(transcriptSessionAllowance(-1)).toBe(HARD_MAX_SESSIONS_PER_MONTH);
  });

  it("keeps zero, which is how the free tier says 'not on this plan'", () => {
    expect(transcriptSessionAllowance(0)).toBe(0);
  });

  it("does not let a non-number become an unbounded allowance", () => {
    expect(transcriptSessionAllowance(Number.NaN)).toBe(HARD_MAX_SESSIONS_PER_MONTH);
    expect(transcriptSessionAllowance(Number.POSITIVE_INFINITY)).toBe(
      HARD_MAX_SESSIONS_PER_MONTH
    );
  });
});

describe("admission", () => {
  it("admits a workspace with room left", () => {
    expect(admitTranscriptSession({ usedSessions: 5, maxSessions: 20 }).allowed).toBe(true);
  });

  it("refuses at the limit rather than one past it", () => {
    const decision = admitTranscriptSession({ usedSessions: 20, maxSessions: 20 });
    expect(decision.allowed).toBe(false);
    expect(decision.error).toMatch(/this month/i);
  });

  it("names the paywall when the plan allows none", () => {
    const decision = admitTranscriptSession({ usedSessions: 0, maxSessions: 0 });
    expect(decision.allowed).toBe(false);
    expect(decision.error).toMatch(/paid plan/i);
  });
});

describe("line text", () => {
  it("collapses the whitespace a recognizer leaves behind", () => {
    expect(cleanLineText("  so   then  we \n ship ")).toBe("so then we ship");
  });

  it("truncates a runaway result rather than storing all of it", () => {
    expect(cleanLineText("a".repeat(5_000))).toHaveLength(HARD_MAX_CHARS_PER_LINE);
  });

  it("returns nothing for anything that is not usable text", () => {
    expect(cleanLineText("   ")).toBe("");
    expect(cleanLineText(null)).toBe("");
    expect(cleanLineText(42)).toBe("");
  });
});

describe("usage", () => {
  const now = new Date("2026-09-06T10:00:00.000Z");
  const period = periodKeyFor(now);

  it("reads an empty counter for a workspace that has never transcribed", () => {
    expect(readTranscriptUsage(undefined, now)).toEqual({
      periodKey: period,
      sessions: 0,
      lines: 0,
    });
  });

  it("reads this month's totals", () => {
    const usage = readTranscriptUsage(
      { transcriptUsage: { periodKey: period, sessions: 3, lines: 900 } },
      now
    );
    expect(usage.sessions).toBe(3);
    expect(usage.lines).toBe(900);
  });

  it("starts again when the stored counter belongs to a previous month", () => {
    const usage = readTranscriptUsage(
      { transcriptUsage: { periodKey: "2026-08", sessions: 400, lines: 90_000 } },
      now
    );
    expect(usage).toEqual({ periodKey: period, sessions: 0, lines: 0 });
  });

  it("does not let a negative or malformed counter buy free allowance", () => {
    const usage = readTranscriptUsage(
      { transcriptUsage: { periodKey: period, sessions: -5, lines: "many" } },
      now
    );
    expect(usage.sessions).toBe(0);
    expect(usage.lines).toBe(0);
  });

  it("counts one more session and the lines it carried", () => {
    const next = applyTranscriptDelta({ periodKey: period, sessions: 2, lines: 10 }, 44);
    expect(next).toEqual({ periodKey: period, sessions: 3, lines: 54 });
  });

  it("counts a session that captured nothing", () => {
    const next = applyTranscriptDelta({ periodKey: period, sessions: 0, lines: 0 }, 0);
    expect(next.sessions).toBe(1);
    expect(next.lines).toBe(0);
  });
});

describe("the period key", () => {
  it("pads the month so keys sort", () => {
    expect(periodKeyFor(new Date("2026-01-31T23:00:00.000Z"))).toBe("2026-01");
  });

  it("is UTC, so a workspace cannot gain a month by travelling", () => {
    expect(periodKeyFor(new Date("2026-09-30T23:30:00.000Z"))).toBe("2026-09");
  });
});
