import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  RING_CYCLE_MS,
  RINGBACK_CYCLE_MS,
  ringCycle,
  ringbackCycle,
  type RingNote,
} from "@/lib/calls/ringtone";

/* ------------------------------------------------------------------ */
/*  Ringtone schedule                                                  */
/*                                                                     */
/*  The oscillators are not testable without a browser and are not     */
/*  worth faking. What is worth pinning down is the arithmetic that    */
/*  decides whether the thing sounds like a phone or like a mistake:   */
/*  notes that run into each other, a cycle whose sound spills past    */
/*  its own end and collides with the next repeat, or a ringback loud  */
/*  enough to compete with the ring it is supposed to sit under.       */
/* ------------------------------------------------------------------ */

function endOf(note: RingNote): number {
  return note.offsetMs + note.durationMs;
}

/** When the last tail in a cycle dies — not the last note's, since struck notes overlap. */
function lastSound(cycle: RingNote[]): number {
  return Math.max(...cycle.map(endOf));
}

/** Oscillators one cycle creates: one per partial a speaker can reproduce. */
function voicesIn(cycle: RingNote[]): number {
  return cycle.reduce(
    (sum, note) =>
      sum + note.partials.filter((p) => note.frequency * p.ratio <= 16_000).length,
    0
  );
}

describe("the ring", () => {
  it("is one six-note phrase", () => {
    expect(ringCycle()).toHaveLength(6);
  });

  it("climbs to a peak, then resolves back down", () => {
    const pitches = ringCycle().map((note) => note.frequency);
    const peak = pitches.indexOf(Math.max(...pitches));
    for (let i = 1; i <= peak; i += 1) {
      expect(pitches[i]).toBeGreaterThan(pitches[i - 1]);
    }
    for (let i = peak + 1; i < pitches.length; i += 1) {
      expect(pitches[i]).toBeLessThan(pitches[i - 1]);
    }
  });

  it("plays its notes in order", () => {
    const offsets = ringCycle().map((note) => note.offsetMs);
    expect(offsets).toEqual([...offsets].sort((a, b) => a - b));
    expect(new Set(offsets).size).toBe(offsets.length);
  });

  it("keeps the notes far enough apart to hear each one", () => {
    const notes = ringCycle();
    for (let i = 0; i < notes.length - 1; i += 1) {
      expect(notes[i + 1].offsetMs - notes[i].offsetMs).toBeGreaterThanOrEqual(100);
    }
  });

  it("finishes inside its own cycle, so repeats do not collide", () => {
    expect(lastSound(ringCycle())).toBeLessThan(RING_CYCLE_MS);
  });

  it("leaves real silence between rings rather than droning", () => {
    expect(RING_CYCLE_MS - lastSound(ringCycle())).toBeGreaterThan(1_000);
  });
});

describe("the ringback", () => {
  it("is two pulses", () => {
    const starts = new Set(ringbackCycle().map((note) => note.offsetMs));
    expect(starts.size).toBe(2);
  });

  it("finishes inside its own cycle", () => {
    expect(lastSound(ringbackCycle())).toBeLessThan(RINGBACK_CYCLE_MS);
  });

  it("is quieter and lower than the ring", () => {
    for (const ringback of ringbackCycle()) {
      for (const note of ringCycle()) {
        expect(ringback.peakGain).toBeLessThan(note.peakGain);
        expect(ringback.frequency).toBeLessThan(note.frequency);
      }
    }
  });
});

describe("both", () => {
  it("are audible — a level that measures as a sound but does not register as one is the bug this catches", () => {
    for (const note of [...ringCycle(), ...ringbackCycle()]) {
      expect(note.peakGain).toBeGreaterThan(0.1);
      expect(note.peakGain).toBeLessThanOrEqual(1);
      expect(note.durationMs).toBeGreaterThan(0);
    }
  });
});

/* ------------------------------------------------------------------ */
/*  Stopping                                                           */
/*                                                                     */
/*  The half that actually breaks. A ring that will not start is       */
/*  obvious the first time somebody tries it; a ring that will not     */
/*  stop is a phone still going off over a live call, and it only      */
/*  shows up on the one path nobody clicked through by hand.           */
/*                                                                     */
/*  Web Audio does not exist under vitest, so the context is a stub —  */
/*  enough of one to count oscillators and see whether they were told  */
/*  to stop.                                                           */
/* ------------------------------------------------------------------ */

class FakeParam {
  value = 0;
  setValueAtTime() {
    return this;
  }
  linearRampToValueAtTime() {
    return this;
  }
  exponentialRampToValueAtTime() {
    return this;
  }
  cancelScheduledValues() {
    return this;
  }
}

class FakeOscillator {
  type = "sine";
  frequency = { value: 0 };
  started = false;
  stops: number[] = [];
  connect(node: unknown) {
    return node;
  }
  disconnect() {}
  start() {
    this.started = true;
  }
  stop(when: number) {
    this.stops.push(when);
  }
}

class FakeGain {
  gain = new FakeParam();
  connect(node: unknown) {
    return node;
  }
  disconnect() {}
}

class FakeAudioContext {
  state = "running";
  currentTime = 0;
  oscillators: FakeOscillator[] = [];
  destination = {};
  createOscillator() {
    const oscillator = new FakeOscillator();
    this.oscillators.push(oscillator);
    return oscillator;
  }
  createGain() {
    return new FakeGain();
  }
  createBiquadFilter() {
    return { type: "lowpass", frequency: new FakeParam(), connect: (n: unknown) => n };
  }
  createDelay() {
    return { delayTime: new FakeParam(), connect: (n: unknown) => n };
  }
  createDynamicsCompressor() {
    return {
      threshold: new FakeParam(),
      knee: new FakeParam(),
      ratio: new FakeParam(),
      attack: new FakeParam(),
      release: new FakeParam(),
      connect: (n: unknown) => n,
    };
  }
  resume() {
    this.state = "running";
    return Promise.resolve();
  }
}

async function withFakeAudio() {
  vi.resetModules();
  const context = new FakeAudioContext();
  vi.stubGlobal("window", { AudioContext: function () { return context; } });
  const ringtone = await import("@/lib/calls/ringtone");
  return { context, ringtone };
}

describe("the loop", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("plays a cycle immediately, then once per cycle", async () => {
    const { context, ringtone } = await withFakeAudio();
    const perCycle = voicesIn(ringCycle());

    const stop = ringtone.startIncomingRing();
    expect(context.oscillators).toHaveLength(perCycle);

    vi.advanceTimersByTime(RING_CYCLE_MS);
    expect(context.oscillators).toHaveLength(perCycle * 2);

    stop();
  });

  it("stops scheduling once stopped", async () => {
    const { context, ringtone } = await withFakeAudio();

    const stop = ringtone.startIncomingRing();
    const played = context.oscillators.length;

    stop();
    vi.advanceTimersByTime(RING_CYCLE_MS * 5);

    expect(context.oscillators).toHaveLength(played);
  });

  it("silences notes already handed to the hardware", async () => {
    const { context, ringtone } = await withFakeAudio();

    const stop = ringtone.startIncomingRing();
    const scheduled = context.oscillators.map((o) => o.stops.length);
    stop();

    /* Every note now carries a second, earlier stop — the one that ends
       a burst somebody answered over. */
    context.oscillators.forEach((oscillator, index) => {
      expect(oscillator.stops.length).toBe(scheduled[index] + 1);
    });
  });

  it("survives being stopped twice", async () => {
    const { ringtone } = await withFakeAudio();

    const stop = ringtone.startIncomingRing();
    stop();
    expect(() => stop()).not.toThrow();
  });

  it("rings back on the same terms", async () => {
    const { context, ringtone } = await withFakeAudio();

    const stop = ringtone.startRingback();
    expect(context.oscillators).toHaveLength(voicesIn(ringbackCycle()));

    stop();
    vi.advanceTimersByTime(RINGBACK_CYCLE_MS * 3);
    expect(context.oscillators).toHaveLength(voicesIn(ringbackCycle()));
  });
});
