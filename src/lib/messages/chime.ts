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
/*  The first is the autoplay gate. Every current browser starts an    */
/*  AudioContext SUSPENDED unless it was created while the page held a */
/*  user activation. Created lazily at the moment a message lands —    */
/*  which is by definition not a gesture — it starts suspended, and on */
/*  a tab the user has not clicked in, `resume()` is refused. That is  */
/*  exactly the tab you are watching when you send yourself a test     */
/*  message from another window. `primeMessageChime` exists to close   */
/*  that hole: the context is opened on the first real interaction, so */
/*  it is awake long before anything needs to be heard.                */
/*                                                                     */
/*  The second is simply level. The first version peaked at 0.06 for   */
/*  90ms, which measures as a sound and does not register as one next  */
/*  to a fan or a room.                                                */
/* ------------------------------------------------------------------ */

/** A5 then C#6 — a rising third, which reads as "arrived", not "wrong". */
const NOTES = [880, 1108.73];

const NOTE_MS = 140;
const GAP_MS = 70;

/**
 * Peak amplitude per note.
 *
 * Audible across a room at a normal system volume, still well under
 * anything that would make somebody jump. It fires while people are
 * working, and an alarming sound is one they turn off — after which
 * they hear nothing at all.
 */
const PEAK_GAIN = 0.22;

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

/**
 * Opens the audio context while a user gesture is in flight.
 *
 * Call from a real interaction — a click, a keypress. Cheap, idempotent,
 * and the difference between a chime that works and one that is refused
 * by the browser without saying so.
 */
export function primeMessageChime(): void {
  const ctx = audioContext();
  if (!ctx || ctx.state !== "suspended") return;
  void ctx.resume().catch(() => {});
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
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.linearRampToValueAtTime(PEAK_GAIN, startAt + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, end);

  oscillator.connect(gain).connect(ctx.destination);
  oscillator.start(startAt);
  oscillator.stop(end + 0.02);
}

function ring(ctx: AudioContext): void {
  const now = ctx.currentTime;
  NOTES.forEach((frequency, index) => {
    tone(ctx, frequency, now + (index * (NOTE_MS + GAP_MS)) / 1000);
  });
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
  const ctx = audioContext();
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
