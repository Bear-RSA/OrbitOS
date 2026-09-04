import {
  cancelTone,
  getAudioContext,
  tone,
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
  durationMs: number;
  peakGain: number;
}

/* C6 then E6 — brighter and higher than the message chime's rising
   third, because this one is competing with headphones and a room, not
   sitting politely underneath them. */
const RING_NOTES = [1046.5, 1318.51];

const RING_NOTE_MS = 180;

/** Start-to-start within a burst. Longer than the note, so no overlap. */
const RING_NOTE_GAP_MS = 200;

/** Start-to-start between the two bursts that make one "brr-brring". */
const RING_BURST_GAP_MS = 600;

const RING_BURSTS = 2;

/**
 * Peak amplitude per note, above the chime's 0.22.
 *
 * A message chime interrupts someone who is already at the screen. A
 * ring has to reach someone who is not, and it only has 45 seconds.
 */
const RING_PEAK_GAIN = 0.3;

/**
 * One full ring, sound and silence.
 *
 * Roughly a second of ringing then two and a half of nothing, which
 * fits about a dozen rings into the answer window — close enough to a
 * desk phone that nobody has to learn what it means.
 */
export const RING_CYCLE_MS = 3_600;

/** A4. Low, plain, and nothing like the ring — these two never play in
    the same room, but they do get compared by whoever built them. */
const RINGBACK_FREQUENCY = 440;

const RINGBACK_NOTE_MS = 420;

/**
 * Quieter than the ring by design.
 *
 * This one plays to somebody who already knows a call is happening —
 * they started it. It is confirmation that the far end is ringing, not
 * a summons, and it plays into the ear of a person sitting still.
 */
const RINGBACK_PEAK_GAIN = 0.12;

export const RINGBACK_CYCLE_MS = 3_600;

/** The notes of one ring cycle, in order. */
export function ringCycle(): RingNote[] {
  const notes: RingNote[] = [];

  for (let burst = 0; burst < RING_BURSTS; burst += 1) {
    RING_NOTES.forEach((frequency, index) => {
      notes.push({
        frequency,
        offsetMs: burst * RING_BURST_GAP_MS + index * RING_NOTE_GAP_MS,
        durationMs: RING_NOTE_MS,
        peakGain: RING_PEAK_GAIN,
      });
    });
  }

  return notes;
}

/** The notes of one ringback cycle — a single pulse. */
export function ringbackCycle(): RingNote[] {
  return [
    {
      frequency: RINGBACK_FREQUENCY,
      offsetMs: 0,
      durationMs: RINGBACK_NOTE_MS,
      peakGain: RINGBACK_PEAK_GAIN,
    },
  ];
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
