/* ------------------------------------------------------------------ */
/*  Shared audio                                                       */
/*                                                                     */
/*  One AudioContext for the tab, and the envelope every sound in the  */
/*  app is built from. This started life inside the message chime and  */
/*  moved here the moment calls needed to ring, for one reason: THE    */
/*  UNLOCK HAS TO BE SHARED.                                           */
/*                                                                     */
/*  Every current browser starts an AudioContext suspended and refuses */
/*  `resume()` on a page that holds no user activation. A second       */
/*  context created later — at the moment a call arrives, say, which   */
/*  is by definition not a gesture — starts suspended and is refused,  */
/*  even though the first one has been awake since the session's first */
/*  click. So there is exactly one, everything plays through it, and   */
/*  `installAudioPrimer` opens it on the earliest interaction of the   */
/*  session rather than at the moment something is due to be heard.    */
/*                                                                     */
/*  Browsers also cap how many contexts a page may create, which a     */
/*  notifier running for a whole working day would exhaust.            */
/* ------------------------------------------------------------------ */

let context: AudioContext | null = null;

/** The tab's AudioContext, created on first use. Null before hydration. */
export function getAudioContext(): AudioContext | null {
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
 * and the difference between a sound that works and one the browser
 * refuses without saying so.
 */
export function primeAudio(): void {
  const ctx = getAudioContext();
  if (!ctx || ctx.state !== "suspended") return;
  void ctx.resume().catch(() => {});
}

let primerInstalled = false;

/**
 * Arms the session's first interaction to open the audio context.
 *
 * Module-guarded, so every feature that needs to make a sound can call
 * this on mount without any of them having to know the others exist —
 * the incoming-call ring must not be silent merely because it happens to
 * be mounted next to the message notifier.
 *
 * The listeners are deliberately not `{ once: true }`: that removes them
 * on the first event even when the resume was refused, spending the
 * session's only attempt on the one gesture that did not work. These
 * unhook themselves once a resume has actually resolved.
 */
export function installAudioPrimer(): void {
  if (typeof window === "undefined" || primerInstalled) return;
  primerInstalled = true;

  const remove = () => {
    window.removeEventListener("pointerdown", prime);
    window.removeEventListener("keydown", prime);
  };

  const prime = () => {
    const ctx = getAudioContext();
    if (!ctx) {
      remove();
      return;
    }
    if (ctx.state === "running") {
      remove();
      return;
    }
    void ctx.resume().then(remove).catch(() => {});
  };

  window.addEventListener("pointerdown", prime);
  window.addEventListener("keydown", prime);
}

/** How long a note takes to reach full level. See `tone`. */
const ATTACK_SECONDS = 0.015;

/** A note that has been handed to the hardware and can still be called back. */
export interface ScheduledTone {
  oscillator: OscillatorNode;
  gain: GainNode;
}

export interface ToneShape {
  durationMs: number;
  peakGain: number;
}

/**
 * Schedules one sine note.
 *
 * Ramped rather than switched. A square-edged start and stop produces an
 * audible click at the boundary, which is the part that sounds cheap.
 */
export function tone(
  ctx: AudioContext,
  frequency: number,
  startAt: number,
  shape: ToneShape
): ScheduledTone {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();

  oscillator.type = "sine";
  oscillator.frequency.value = frequency;

  const end = startAt + shape.durationMs / 1000;
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.linearRampToValueAtTime(shape.peakGain, startAt + ATTACK_SECONDS);
  gain.gain.exponentialRampToValueAtTime(0.0001, end);

  oscillator.connect(gain).connect(ctx.destination);
  oscillator.start(startAt);
  oscillator.stop(end + 0.02);

  return { oscillator, gain };
}

/**
 * Silences a note that is already scheduled or already sounding.
 *
 * Faded over 30ms rather than cut, for the same reason the attack is
 * ramped — and this one matters more, because the moment it happens is
 * the moment somebody answered a call. A click is a poor first thing to
 * hear on a line that just opened.
 */
export function cancelTone(ctx: AudioContext, scheduled: ScheduledTone): void {
  const now = ctx.currentTime;

  try {
    scheduled.gain.gain.cancelScheduledValues(now);
    scheduled.gain.gain.setValueAtTime(
      Math.max(scheduled.gain.gain.value, 0.0001),
      now
    );
    scheduled.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.03);
    scheduled.oscillator.stop(now + 0.04);
  } catch {
    /* Already stopped, or stopped between the check and the call. Both
       are the outcome this function wanted. */
  }
}
