import {
  BELL,
  getAudioContext,
  primeAudio,
  tone,
} from "@/lib/audio/context";

/* ------------------------------------------------------------------ */
/*  Message chime                                                      */
/*                                                                     */
/*  Synthesized rather than a file, deliberately. An mp3 would be a    */
/*  network request that has to land BEFORE the sound is due, which is */
/*  the one moment it cannot be late — and a request that fails on a   */
/*  bad connection is a notification that silently stops working. Two  */
/*  oscillators cost nothing, are instant, and work offline.           */
/*                                                                     */
/*  TWO THINGS MAKE A CHIME LIKE THIS INAUDIBLE, and the first build   */
/*  of this file had both.                                             */
/*                                                                     */
/*  The first is the autoplay gate — the context has to be opened on a */
/*  real gesture long before anything needs to be heard. That problem  */
/*  is now solved once for the whole app in `@/lib/audio/context`,     */
/*  which is also where the shared context and the click-free envelope */
/*  live, so the call ringtone inherits the same unlock.               */
/*                                                                     */
/*  The second is simply level. The first version peaked at 0.06 for   */
/*  90ms, which measures as a sound and does not register as one next  */
/*  to a fan or a room.                                                */
/* ------------------------------------------------------------------ */

/**
 * G5 then D6 — a rising fifth, struck like a small bell and left to
 * ring. The fifth is the most consonant leap there is, so it reads as
 * "something arrived" with no hint of "something went wrong". The
 * second note is quieter and longer: a tap, then its answer.
 */
const NOTES = [
  { frequency: 783.99, offsetMs: 0, durationMs: 650, peakGain: 0.2 },
  { frequency: 1174.66, offsetMs: 95, durationMs: 1_100, peakGain: 0.17 },
];

/*
 * Peak level sits around 0.2.
 *
 * Audible across a room at a normal system volume, still well under
 * anything that would make somebody jump. It fires while people are
 * working, and an alarming sound is one they turn off — after which
 * they hear nothing at all.
 */

/**
 * Opens the audio context while a user gesture is in flight.
 *
 * Kept as its own export because the settings page calls it by name;
 * the work itself is shared with every other sound in the app.
 */
export function primeMessageChime(): void {
  primeAudio();
}

function ring(ctx: AudioContext): void {
  const now = ctx.currentTime;
  for (const note of NOTES) {
    tone(ctx, note.frequency, now + note.offsetMs / 1000, {
      durationMs: note.durationMs,
      peakGain: note.peakGain,
      attackMs: 4,
      partials: BELL,
    });
  }
}

/**
 * Plays the arrival chime. Never throws.
 *
 * When the browser refuses — a tab restored from history that has never
 * been clicked — it says so once in the console rather than failing
 * silently. A notification you cannot hear and cannot diagnose is worse
 * than one that is simply off.
 */
export function playMessageChime(): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  if (ctx.state === "suspended") {
    void ctx
      .resume()
      .then(() => ring(ctx))
      .catch(() => {
        console.warn(
          "[Chime] Browser refused to start audio — the tab has not been interacted with yet."
        );
      });
    return;
  }

  try {
    ring(ctx);
  } catch (err) {
    console.warn("[Chime] Could not play:", err);
  }
}
