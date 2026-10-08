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

/* ------------------------------------------------------------------ */
/*  The output bus                                                     */
/*                                                                     */
/*  Every note goes through one chain before the speakers: a gentle    */
/*  low-pass to take the glassy edge off the upper partials, a short   */
/*  damped echo that gives the note a room to ring in, and a           */
/*  compressor so stacked partials never clip. A bare oscillator into  */
/*  `destination` is what made the first versions sound like a         */
/*  microwave; this chain is most of the difference.                   */
/* ------------------------------------------------------------------ */

let bus: { ctx: AudioContext; input: AudioNode } | null = null;

function output(ctx: AudioContext): AudioNode {
  if (bus?.ctx === ctx) return bus.input;

  const input = ctx.createGain();

  const soften = ctx.createBiquadFilter();
  soften.type = "lowpass";
  soften.frequency.value = 7_000;

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -12;
  limiter.knee.value = 10;
  limiter.ratio.value = 6;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.2;

  input.connect(soften).connect(limiter).connect(ctx.destination);

  /* The room. Quiet, short and darker than the dry note, so it reads as
     space around the sound rather than as a second sound. */
  const send = ctx.createGain();
  send.gain.value = 0.22;
  const delay = ctx.createDelay(1);
  delay.delayTime.value = 0.13;
  const damp = ctx.createBiquadFilter();
  damp.type = "lowpass";
  damp.frequency.value = 2_400;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.32;

  input.connect(send).connect(delay).connect(damp).connect(feedback).connect(delay);
  damp.connect(limiter);

  bus = { ctx, input };
  return input;
}

/** Default time for a note to reach full level. See `tone`. */
const ATTACK_MS = 6;

/**
 * One overtone of a note: a multiple of the fundamental, its level
 * relative to the fundamental, and how much of the note's length it
 * lasts. Real struck things lose their high partials first, which is
 * why `decay` is usually below 1 for anything above the fundamental.
 */
export interface Partial {
  ratio: number;
  gain: number;
  decay?: number;
}

/** A plain sine. The fallback, and the ringback's base. */
export const PURE: readonly Partial[] = [{ ratio: 1, gain: 1 }];

/**
 * Struck wooden bar. The overtones sit at roughly 4x and 10x, not at
 * the harmonic 2x and 3x, and die almost at once — that inharmonic
 * click at the start is what the ear recognises as "marimba".
 */
export const MARIMBA: readonly Partial[] = [
  { ratio: 1, gain: 1 },
  { ratio: 3.93, gain: 0.16, decay: 0.25 },
  { ratio: 9.87, gain: 0.04, decay: 0.08 },
];

/**
 * Small bell or kalimba. A harmonic octave for warmth, plus a faint
 * inharmonic shimmer that fades well before the note does.
 */
export const BELL: readonly Partial[] = [
  { ratio: 1, gain: 1 },
  { ratio: 2, gain: 0.22, decay: 0.55 },
  { ratio: 2.76, gain: 0.07, decay: 0.3 },
  { ratio: 5.4, gain: 0.025, decay: 0.15 },
];

/** A note that has been handed to the hardware and can still be called back. */
export interface ScheduledTone {
  voices: { oscillator: OscillatorNode; gain: GainNode }[];
}

export interface ToneShape {
  durationMs: number;
  peakGain: number;
  attackMs?: number;
  /**
   * When set, the note holds at full level and fades over this long at
   * the end — a sustained tone. When not, it decays from the moment it
   * peaks, the way anything struck does.
   */
  releaseMs?: number;
  partials?: readonly Partial[];
}

/**
 * Schedules one note, built from one sine per partial.
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
  const destination = output(ctx);
  const attack = (shape.attackMs ?? ATTACK_MS) / 1000;
  const voices: ScheduledTone["voices"] = [];

  for (const partial of shape.partials ?? PURE) {
    const pitch = frequency * partial.ratio;
    /* Past what a speaker reproduces cleanly, a partial is only aliasing. */
    if (pitch > 16_000) continue;

    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();

    oscillator.type = "sine";
    oscillator.frequency.value = pitch;

    const peak = shape.peakGain * partial.gain;
    const length = (shape.durationMs / 1000) * (partial.decay ?? 1);
    const end = startAt + Math.max(length, attack + 0.01);

    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.linearRampToValueAtTime(peak, startAt + attack);
    if (shape.releaseMs !== undefined) {
      const fadeFrom = Math.max(startAt + attack, end - shape.releaseMs / 1000);
      gain.gain.setValueAtTime(peak, fadeFrom);
    }
    gain.gain.exponentialRampToValueAtTime(0.0001, end);

    oscillator.connect(gain).connect(destination);
    oscillator.start(startAt);
    oscillator.stop(end + 0.02);

    voices.push({ oscillator, gain });
  }

  return { voices };
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

  for (const { oscillator, gain } of scheduled.voices) {
    try {
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(Math.max(gain.gain.value, 0.0001), now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.03);
      oscillator.stop(now + 0.04);
    } catch {
      /* Already stopped, or stopped between the check and the call. Both
         are the outcome this function wanted. */
    }
  }
}
