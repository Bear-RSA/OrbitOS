import type { ConsentDecision, TranscriptLine } from "@/types/transcript";

/* ------------------------------------------------------------------ */
/*  Rendering                                                          */
/*                                                                     */
/*  Lines in, one text file out. Pure, so the thing people actually    */
/*  take away from a meeting can be tested without holding a meeting.  */
/*                                                                     */
/*  Two choices worth stating.                                         */
/*                                                                     */
/*  Timestamps are OFFSETS from the start of the call, not wall clock. */
/*  This renders on a server in UTC for readers in South Africa, and a */
/*  transcript stamped two hours off is worse than one that says       */
/*  nothing. "Fourteen minutes in" is also what somebody scrubbing a   */
/*  meeting back actually wants. The absolute start is in the header,  */
/*  once, where it can carry its own zone.                             */
/*                                                                     */
/*  The footer names who was captured AND who was not. A transcript    */
/*  with a silent gap where somebody spoke is a misleading record, and */
/*  the gaps here are ordinary: a participant who declined, or one on  */
/*  a browser with no speech recognition at all.                       */
/* ------------------------------------------------------------------ */

export interface RenderParticipant {
  uid: string;
  name: string;
  decision: ConsentDecision;
}

export interface RenderTranscriptInput {
  title: string;
  /** Unix millis. Offsets are measured from here. */
  startedAt: number;
  endedAt: number;
  lines: TranscriptLine[];
  participants: RenderParticipant[];
}

const RULE = "-".repeat(64);

/** `01:04:09`, or `04:09` under an hour. Never negative. */
export function offsetLabel(millis: number): string {
  const total = Math.max(Math.floor((Number.isFinite(millis) ? millis : 0) / 1000), 0);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** How long the call ran, in words. */
export function durationLabel(startedAt: number, endedAt: number): string {
  const minutes = Math.max(Math.round((endedAt - startedAt) / 60_000), 0);
  if (minutes < 1) return "under a minute";
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

/**
 * A file name that sorts by date and survives every filesystem.
 *
 * The title is squeezed rather than trusted: it comes from a
 * conversation name somebody typed, and a slash in it is the difference
 * between a download and a browser error.
 */
export function transcriptFileName(title: string, startedAt: number): string {
  const stamp = new Date(startedAt).toISOString().slice(0, 10);
  const safe =
    (title || "Meeting")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 60) || "Meeting";
  return `transcript-${safe}-${stamp}.txt`;
}

/**
 * Merges every speaker's lines into one ordered record.
 *
 * Sorted by the moment each utterance finished. Two people talking over
 * each other land next to each other, in the order the words actually
 * stopped, and the uid breaks a tie so the output is stable rather than
 * dependent on which flush arrived first.
 */
export function orderLines(lines: TranscriptLine[]): TranscriptLine[] {
  return [...lines].sort((a, b) => {
    if (a.at !== b.at) return a.at - b.at;
    if (a.uid !== b.uid) return a.uid < b.uid ? -1 : 1;
    return a.seq - b.seq;
  });
}

export function renderTranscript(input: RenderTranscriptInput): string {
  const { title, startedAt, endedAt, participants } = input;
  const ordered = orderLines(input.lines);

  const captured = participants.filter((p) => p.decision === "accepted");
  const excused = participants.filter((p) => p.decision === "declined");

  const head: string[] = [
    "MEETING TRANSCRIPT",
    title || "Meeting",
    `${new Date(startedAt).toISOString().replace("T", " ").slice(0, 16)} UTC · ${durationLabel(
      startedAt,
      endedAt
    )}`,
    "",
  ];

  head.push(
    captured.length
      ? `Captured: ${captured.map((p) => p.name).join(", ")}`
      : "Captured: nobody"
  );
  if (excused.length) {
    head.push(`Not captured: ${excused.map((p) => p.name).join(", ")} (declined)`);
  }

  head.push("");
  head.push(
    "Each person was transcribed by their own browser, so anyone whose",
    "browser cannot do speech recognition is absent below even if they",
    "agreed. Times are measured from the start of the call.",
    RULE,
    ""
  );

  if (!ordered.length) {
    head.push("Nothing was captured.");
    return `${head.join("\n")}\n`;
  }

  const body: string[] = [];
  let lastSpeaker = "";

  for (const line of ordered) {
    /* A new block per speaker rather than per line. A back-and-forth
       reads as a conversation instead of as a stack of stamps. */
    if (line.uid !== lastSpeaker) {
      if (body.length) body.push("");
      body.push(`[${offsetLabel(line.at - startedAt)}] ${line.name}`);
      lastSpeaker = line.uid;
    }
    body.push(`  ${line.text}`);
  }

  return `${[...head, ...body].join("\n")}\n`;
}
