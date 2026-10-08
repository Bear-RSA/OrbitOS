import {
  cancelTone,
  getAudioContext,
  MARIMBA,
  PURE,
  tone,
  type Partial,
  type ScheduledTone,
} from "@/lib/audio/context";

/* ------------------------------------------------------------------ */
/*  Call ringtone                                                      */
/*                                                                     */
/*  The two sounds a direct call makes: the ring the callee hears, and */
/*  the ringback the caller hears while they wait.                     */
/*                                                                     */
/*  Split the way `access.ts` is — the schedule is pure and tested,    */
/*  the part that touches the hardware is thin enough to read in one   */
/*  sitting. Synthesized for the same reason the message chime is: a   */
/*  ringtone fetched over the network is a phone that stops ringing on */
/*  a bad connection, and does it quietly.                             */
/*                                                                     */
/*  UNLIKE THE CHIME, THIS LOOPS, and a loop needs a way out that      */
/*  cannot be forgotten. Both starters return a stop function, both    */
/*  stops are idempotent, and both cancel notes that were already      */
/*  handed to the hardware — a burst scheduled a beat before somebody  */
/*  hit Answer would otherwise keep sounding over the live call.       */
/*                                                                     */
/*  This file is client-only in practice but carries no server import, */
/*  unlike its neighbours `provider.ts` and `daily-provider.ts`.       */
/* ------------------------------------------------------------------ */

/** One note of a cycle, positioned relative to the start of that cycle. */
export interface RingNote {
  frequency: number;
  offsetMs: number;
  /** How long the note rings. Struck notes overlap their neighbours' tails. */
  durationMs: number;
  peakGain: number;
  partials: readonly Partial[];
  attackMs?: number;
  releaseMs?: number;
}

/* E major, B5 up to B6 and back down to E6, on a marimba. Up-and-back
   is the shape of a phrase that asks and answers, so it sounds finished
   every cycle instead of cut off. Everything sits above the ringback,
   which is a different job: this one has to reach across a room. */
const B5 = 987.77;
const E6 = 1318.51;
const Gs6 = 1661.22;
const B6 = 1975.53;

/** Start-to-start between notes — a brisk eighth note. */
const STEP_MS = 125;

/**
 * Peak amplitude per note, above the chime's 0.2.
 *
 * A message chime interrupts someone who is already at the screen. A
 * ring has to reach someone who is not, and it only has 45 seconds.
 */
const RING_PEAK_GAIN = 0.26;

const RING_PHRASE: [frequency: number, step: number, durationMs: number][] = [
  [B5, 0, 420],
  [E6, 1, 420],
  [Gs6, 2, 420],
  [B6, 3, 650],
  [Gs6, 5, 420],
  [E6, 6, 1_100],
];

/**
 * One full ring, sound and silence.
 *
 * About a second and a half of phrase then two of quiet — close enough
 * to a desk phone's rhythm that nobody has to learn what it means.
 */
export const RING_CYCLE_MS = 3_600;

/* A4 and C#5 together — a warm major third, held. Low, soft and steady
   where the ring is high, struck and moving: these two never play in
   the same room, but they should not sound like relatives. */
const RINGBACK_CHORD = [440, 554.37];

/** UK cadence: on, short gap, on, long gap. Read instantly as "ringing". */
const RINGBACK_PULSES_MS = [0, 600];
const RINGBACK_PULSE_MS = 420;

/**
 * Quieter than the ring by design.
 *
 * This one plays to somebody who already knows a call is happening —
 * they started it. It is confirmation that the far end is ringing, not
 * a summons, and it plays into the ear of a person sitting still.
 */
const RINGBACK_PEAK_GAIN = 0.11;

export const RINGBACK_CYCLE_MS = 3_000;

/** The notes of one ring cycle, in order. */
export function ringCycle(): RingNote[] {
  return RING_PHRASE.map(([frequency, step, durationMs]) => ({
    frequency,
    offsetMs: step * STEP_MS,
    durationMs,
    peakGain: RING_PEAK_GAIN,
    partials: MARIMBA,
    attackMs: 3,
  }));
}

/** The notes of one ringback cycle — two soft held chords. */
export function ringbackCycle(): RingNote[] {
  return RINGBACK_PULSES_MS.flatMap((offsetMs) =>
    RINGBACK_CHORD.map((frequency) => ({
      frequency,
      offsetMs,
      durationMs: RINGBACK_PULSE_MS,
      peakGain: RINGBACK_PEAK_GAIN,
      partials: PURE,
      attackMs: 40,
      releaseMs: 120,
    }))
  );
}

/** No-op stop, for every path where there is no audio to stop. */
const SILENT = () => {};

function loop(notes: RingNote[], cycleMs: number, label: string): () => void {
  const ctx = getAudioContext();
  if (!ctx) return SILENT;

  let stopped = false;
  let timer: ReturnType<typeof setInterval> | null = null;

  /* The notes of the cycle currently in flight. Replaced rather than
     appended each cycle: every note of the previous one has finished
     long before the next begins, and an array that only grows is a leak
     on a phone somebody leaves ringing. */
  let live: ScheduledTone[] = [];

  const playCycle = () => {
    if (stopped) return;

    const now = ctx.currentTime;
    const scheduled: ScheduledTone[] = [];

    for (const note of notes) {
      try {
        scheduled.push(
          tone(ctx, note.frequency, now + note.offsetMs / 1000, {
            durationMs: note.durationMs,
            peakGain: note.peakGain,
            partials: note.partials,
            attackMs: note.attackMs,
            releaseMs: note.releaseMs,
          })
        );
      } catch (err) {
        console.warn(`[${label}] Could not play:`, err);
      }
    }

    live = scheduled;
  };

  const begin = () => {
    if (stopped) return;
    playCycle();
    timer = setInterval(playCycle, cycleMs);
  };

  if (ctx.state === "suspended") {
    void ctx
      .resume()
      .then(begin)
      .catch(() => {
        console.warn(
          `[${label}] Browser refused to start audio — the tab has not been interacted with yet.`
        );
      });
  } else {
    begin();
  }

  return () => {
    if (stopped) return;
    stopped = true;

    if (timer !== null) clearInterval(timer);
    timer = null;

    for (const scheduled of live) cancelTone(ctx, scheduled);
    live = [];
  };
}

/**
 * Starts the incoming ring. Returns the stop.
 *
 * Meant to be returned straight out of the effect that owns the ringing
 * state, so that answering, declining, the ring expiring, signing out
 * and unmounting all silence it through the same cleanup — none of them
 * needs to remember to, so none of them can forget.
 */
export function startIncomingRing(): () => void {
  return loop(ringCycle(), RING_CYCLE_MS, "Ringtone");
}

/** Starts the caller's ringback. Returns the stop. */
export function startRingback(): () => void {
  return loop(ringbackCycle(), RINGBACK_CYCLE_MS, "Ringback");
}
