import { describe, expect, it } from "vitest";
import {
  durationLabel,
  offsetLabel,
  orderLines,
  renderTranscript,
  transcriptFileName,
} from "@/lib/transcripts/render";
import type { TranscriptLine } from "@/types/transcript";

/* ------------------------------------------------------------------ */
/*  Rendering                                                          */
/*                                                                     */
/*  The file people actually take away from the meeting. What is       */
/*  tested here is mostly honesty: that a transcript with gaps in it   */
/*  says so, and that two people talking at once come out in the order */
/*  they finished rather than in the order their browsers reported.    */
/* ------------------------------------------------------------------ */

const START = Date.UTC(2026, 8, 6, 9, 30, 0);

function line(uid: string, name: string, seq: number, offsetMs: number, text: string): TranscriptLine {
  return { uid, name, seq, at: START + offsetMs, text };
}

describe("offsets", () => {
  it("reads as minutes and seconds under an hour", () => {
    expect(offsetLabel(0)).toBe("00:00");
    expect(offsetLabel(65_000)).toBe("01:05");
  });

  it("grows an hours field only when it needs one", () => {
    expect(offsetLabel(3_600_000)).toBe("1:00:00");
    expect(offsetLabel(3_725_000)).toBe("1:02:05");
  });

  it("never goes backwards on a clock that did", () => {
    expect(offsetLabel(-5_000)).toBe("00:00");
    expect(offsetLabel(Number.NaN)).toBe("00:00");
  });
});

describe("duration", () => {
  it("rounds to whole minutes", () => {
    expect(durationLabel(START, START + 38 * 60_000)).toBe("38 minutes");
    expect(durationLabel(START, START + 60_000)).toBe("1 minute");
  });

  it("says so when the call barely happened", () => {
    expect(durationLabel(START, START + 4_000)).toBe("under a minute");
  });
});

describe("file names", () => {
  it("carries the meeting and the date", () => {
    expect(transcriptFileName("Monday Standup", START)).toBe(
      "transcript-Monday-Standup-2026-09-06.txt"
    );
  });

  it("strips what a filesystem would choke on", () => {
    expect(transcriptFileName("Q3 review / budget", START)).toBe(
      "transcript-Q3-review-budget-2026-09-06.txt"
    );
  });

  it("falls back rather than producing a nameless file", () => {
    expect(transcriptFileName("///", START)).toBe("transcript-Meeting-2026-09-06.txt");
    expect(transcriptFileName("", START)).toBe("transcript-Meeting-2026-09-06.txt");
  });
});

describe("ordering", () => {
  it("merges speakers by when each utterance finished", () => {
    const ordered = orderLines([
      line("u2", "Thandi", 1, 4_000, "second"),
      line("u1", "Bear", 1, 1_000, "first"),
      line("u1", "Bear", 2, 9_000, "third"),
    ]);
    expect(ordered.map((l) => l.text)).toEqual(["first", "second", "third"]);
  });

  it("is stable when two people finish on the same millisecond", () => {
    const input = [
      line("u2", "Thandi", 1, 1_000, "hers"),
      line("u1", "Bear", 1, 1_000, "his"),
    ];
    expect(orderLines(input).map((l) => l.text)).toEqual(["his", "hers"]);
    expect(orderLines([...input].reverse()).map((l) => l.text)).toEqual(["his", "hers"]);
  });

  it("leaves the caller's array alone", () => {
    const input = [line("u2", "Thandi", 1, 4_000, "b"), line("u1", "Bear", 1, 1_000, "a")];
    orderLines(input);
    expect(input[0].text).toBe("b");
  });
});

describe("the rendered transcript", () => {
  const participants = [
    { uid: "u1", name: "Bear", decision: "accepted" as const },
    { uid: "u2", name: "Thandi", decision: "accepted" as const },
  ];

  it("names the meeting, when it ran, and who was captured", () => {
    const text = renderTranscript({
      title: "Monday Standup",
      startedAt: START,
      endedAt: START + 12 * 60_000,
      participants,
      lines: [line("u1", "Bear", 1, 2_000, "Morning.")],
    });

    expect(text).toContain("Monday Standup");
    expect(text).toContain("2026-09-06 09:30 UTC");
    expect(text).toContain("12 minutes");
    expect(text).toContain("Captured: Bear, Thandi");
  });

  it("says out loud who was not captured", () => {
    const text = renderTranscript({
      title: "Budget",
      startedAt: START,
      endedAt: START + 60_000,
      participants: [...participants, { uid: "u3", name: "Sam", decision: "declined" as const }],
      lines: [line("u1", "Bear", 1, 1_000, "Right.")],
    });

    expect(text).toContain("Not captured: Sam (declined)");
  });

  it("groups a run of lines under one speaker heading", () => {
    const text = renderTranscript({
      title: "Standup",
      startedAt: START,
      endedAt: START + 60_000,
      participants,
      lines: [
        line("u1", "Bear", 1, 1_000, "First thing."),
        line("u1", "Bear", 2, 3_000, "Second thing."),
        line("u2", "Thandi", 1, 6_000, "Understood."),
      ],
    });

    expect(text).toContain("[00:01] Bear");
    expect(text).toContain("  First thing.");
    expect(text).toContain("  Second thing.");
    expect(text).toContain("[00:06] Thandi");
    /* One heading for the run, not one per line. */
    expect(text.match(/\] Bear/g)).toHaveLength(1);
  });

  it("starts a new heading when a speaker comes back", () => {
    const text = renderTranscript({
      title: "Standup",
      startedAt: START,
      endedAt: START + 60_000,
      participants,
      lines: [
        line("u1", "Bear", 1, 1_000, "Mine."),
        line("u2", "Thandi", 1, 2_000, "Hers."),
        line("u1", "Bear", 2, 3_000, "Mine again."),
      ],
    });

    expect(text.match(/\] Bear/g)).toHaveLength(2);
  });

  it("says nothing was captured rather than handing over an empty file", () => {
    const text = renderTranscript({
      title: "Standup",
      startedAt: START,
      endedAt: START + 60_000,
      participants,
      lines: [],
    });

    expect(text).toContain("Nothing was captured.");
  });

  it("warns that a browser without speech recognition leaves no trace", () => {
    const text = renderTranscript({
      title: "Standup",
      startedAt: START,
      endedAt: START + 60_000,
      participants,
      lines: [line("u1", "Bear", 1, 1_000, "Hello.")],
    });

    expect(text).toMatch(/own browser/i);
  });
});
