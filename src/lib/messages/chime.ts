/* ------------------------------------------------------------------ */
/*  Message chime                                                      */
/*                                                                     */
/*  Synthesized rather than a file, deliberately. An mp3 would be a    */
/*  network request that has to land BEFORE the sound is due, which is */
/*  the one moment it cannot be late — and a request that fails on a   */
/*  bad connection is a notification that silently stops working. Two  */
/*  oscillators cost nothing, are instant, and work offline.           */
/*                                                                     */
/*  It is also quiet on purpose: a rising minor third at low gain,     */
/*  ~200ms all in. This fires while somebody is working, possibly in a */
/*  room with other people, and an alarming sound is one people turn   */
/*  off — after which they hear nothing at all.                        */
/* ------------------------------------------------------------------ */

/** A4 and C#6 — a rising third, which reads as "arrived", not "wrong". */
const NOTES = [880, 1108.73];

const NOTE_MS = 90;
const GAP_MS = 60;

/** Well below anything that would startle. */
const PEAK_GAIN = 0.06;

/**
 * One AudioContext for the tab.
 *
 * Browsers cap how many a page may create, and a notifier that runs for
 * a whole session would exhaust that budget in an afternoon.
 */
let context: AudioContext | null = null;

function audioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;

  if (!context) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;
    context = new Ctor();
  }
  return context;
}

function tone(ctx: AudioContext, frequency: number, startAt: number): void {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();

  oscillator.type = "sine";
  oscillator.frequency.value = frequency;

  /* Ramped rather than switched. A square-edged start and stop produces
     an audible click at the boundary, which is the part that sounds
     cheap. */
  const end = startAt + NOTE_MS / 1000;
  gain.gain.setValueAtTime(0, startAt);
  gain.gain.linearRampToValueAtTime(PEAK_GAIN, startAt + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, end);

  oscillator.connect(gain).connect(ctx.destination);
  oscillator.start(startAt);
  oscillator.stop(end + 0.02);
}

/**
 * Plays the arrival chime. Never throws and never blocks.
 *
 * Audio is gated behind a user gesture in every current browser. A
 * signed-in user has clicked plenty, so the context is normally allowed
 * to resume — but on a tab restored from history it may not be, and a
 * notification sound is not worth an unhandled rejection. Silence is the
 * correct failure here.
 */
export function playMessageChime(): void {
  const ctx = audioContext();
  if (!ctx) return;

  const start = () => {
    const now = ctx.currentTime;
    NOTES.forEach((frequency, index) => {
      tone(ctx, frequency, now + (index * (NOTE_MS + GAP_MS)) / 1000);
    });
  };

  if (ctx.state === "suspended") {
    void ctx.resume().then(start).catch(() => {});
    return;
  }

  try {
    start();
  } catch {
    /* An oscillator that would not start is not worth a broken render. */
  }
}
