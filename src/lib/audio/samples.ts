import { getAudioContext } from "@/lib/audio/context";

/* ------------------------------------------------------------------ */
/*  Recorded sounds                                                    */
/*                                                                     */
/*  The message chime and the incoming ring are recordings in          */
/*  `public/sounds`. They play through the same AudioContext as        */
/*  everything else, so they inherit its unlock — an <audio> element   */
/*  would need its own gesture, and a call never arrives with one.     */
/*                                                                     */
/*  A FILE IS A NETWORK REQUEST, which is why the synthesized versions */
/*  are still here. Each sound is fetched the moment its module loads, */
/*  long before anything is due to be heard, and if that fetch or the  */
/*  decode fails the caller's synthesized sound plays instead. A bad   */
/*  connection costs the nicer sound, never the notification.          */
/*                                                                     */
/*  Recordings skip the synth's output bus. They are already mixed,    */
/*  and the echo and low-pass that make an oscillator sound like an    */
/*  instrument would only muddy them.                                  */
/* ------------------------------------------------------------------ */

export const MESSAGE_SOUND = "/sounds/message.mp3";
export const RING_SOUND = "/sounds/ring.mp3";

/** Length of `ring.mp3`, for anything that wants to play it once. */
export const RING_SOUND_MS = 7_760;

export type Stop = () => void;

const SILENT: Stop = () => {};

interface Entry {
  bytes: Promise<ArrayBuffer>;
  decoding: Promise<AudioBuffer> | null;
  buffer: AudioBuffer | null;
  /** Decode failed. Permanent — the same bytes will not decode next time. */
  broken: boolean;
}

const entries = new Map<string, Entry>();

function canFetch(): boolean {
  return typeof window !== "undefined" && typeof window.fetch === "function";
}

function entry(url: string): Entry | null {
  if (!canFetch()) return null;

  const existing = entries.get(url);
  if (existing) return existing;

  const created: Entry = {
    bytes: window.fetch(url).then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.arrayBuffer();
    }),
    decoding: null,
    buffer: null,
    broken: false,
  };
  /* A failed fetch is forgotten rather than remembered, so the next
     sound tries the network again. Only this one falls back. */
  created.bytes.catch(() => {
    if (entries.get(url) === created) entries.delete(url);
  });

  entries.set(url, created);
  return created;
}

/** Starts downloading a sound so it is already here when it is needed. */
export function prefetchSample(url: string): void {
  entry(url);
}

function decode(ctx: AudioContext, url: string): Entry | null {
  const found = entry(url);
  if (!found || found.broken || typeof ctx.decodeAudioData !== "function") {
    return null;
  }

  if (!found.decoding) {
    /* Copied, because decoding detaches the buffer it is handed. */
    found.decoding = found.bytes
      .then((bytes) => ctx.decodeAudioData(bytes.slice(0)))
      .then((buffer) => {
        found.buffer = buffer;
        return buffer;
      });
    found.decoding.catch(() => {
      found.broken = true;
    });
  }
  return found;
}

function voice(
  ctx: AudioContext,
  buffer: AudioBuffer,
  gain: number,
  loop: boolean
): Stop {
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = loop;

  const level = ctx.createGain();
  level.gain.value = gain;

  source.connect(level).connect(ctx.destination);
  source.start();

  /* Faded over 30ms rather than cut — see `cancelTone` for why that
     matters most at the moment somebody answers. */
  return () => {
    try {
      const now = ctx.currentTime;
      level.gain.cancelScheduledValues(now);
      level.gain.setValueAtTime(Math.max(level.gain.value, 0.0001), now);
      level.gain.exponentialRampToValueAtTime(0.0001, now + 0.03);
      source.stop(now + 0.04);
    } catch {
      /* Already finished. */
    }
  };
}

export interface SampleOptions {
  /** Playback level, 0 to 1. */
  gain: number;
  loop?: boolean;
  /** Console prefix for the one warning this can print. */
  label: string;
}

/**
 * Plays a recorded sound, or `fallback` when the recording cannot be
 * had. Returns a stop that silences whichever one ended up playing.
 * Never throws.
 */
export function playSample(
  url: string,
  options: SampleOptions,
  fallback: () => Stop
): Stop {
  const ctx = getAudioContext();
  if (!ctx) return SILENT;

  const found = decode(ctx, url);
  if (!found?.decoding) return fallback();
  const decoding = found.decoding;

  let stopped = false;
  let current: Stop | null = null;

  const run = (buffer: AudioBuffer | null) => {
    if (stopped) return;
    try {
      current = buffer
        ? voice(ctx, buffer, options.gain, options.loop ?? false)
        : fallback();
    } catch (err) {
      console.warn(`[${options.label}] Could not play:`, err);
    }
  };

  const go = () => {
    if (found.buffer) run(found.buffer);
    else void decoding.then(run, () => run(null));
  };

  /* Not only "suspended": iOS also reports "interrupted" after the app
     was backgrounded, and notes scheduled into either are silent. */
  if (ctx.state !== "running") {
    void ctx
      .resume()
      .then(go)
      .catch(() => {
        console.warn(
          `[${options.label}] Browser refused to start audio — the tab has not been interacted with yet.`
        );
      });
  } else {
    go();
  }

  return () => {
    if (stopped) return;
    stopped = true;
    current?.();
    current = null;
  };
}
