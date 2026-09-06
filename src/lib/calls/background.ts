import type { DailyCall } from "@daily-co/daily-js";

/* ------------------------------------------------------------------ */
/*  Keeping a call alive when nobody is looking at it                  */
/*                                                                     */
/*  A phone in a pocket is the hard case. Mobile browsers throttle and */
/*  eventually freeze a tab that is neither visible nor making a       */
/*  sound, and a frozen tab is a dropped call — which on the receiving */
/*  end is indistinguishable from being hung up on.                    */
/*                                                                     */
/*  Four measures, in the order they matter:                           */
/*                                                                     */
/*    1. Don't let the screen lock at all. A Wake Lock held for the    */
/*       length of the call sidesteps the whole problem on the devices */
/*       that grant one — which is every current Android Chrome and    */
/*       Safari from 16.4.                                             */
/*    2. Keep the tab audible. A tab that owns an audio session is not */
/*       a tab browsers freeze. The call is usually making noise on    */
/*       its own; this covers the stretch where the room is silent.    */
/*    3. Tell the OS a call is in progress, so it shows up on the lock */
/*       screen as something running rather than as a stale page.      */
/*    4. Park the camera while hidden, on phones. The OS is going to   */
/*       stop that track anyway; doing it deliberately means the room  */
/*       sees a clean exit instead of a frozen last frame, and the     */
/*       radio stops burning battery for a picture of a pocket.        */
/*                                                                     */
/*  NONE OF IT IS LOAD-BEARING. Every one of these APIs is missing or  */
/*  refused somewhere, so each returns its own stop function, each     */
/*  swallows failure, and a browser that grants nothing still gets the */
/*  call it would have had before. What no web API can promise is iOS  */
/*  with the screen actually locked: the OS suspends WebRTC there and  */
/*  no page can talk it out of that. Measure 1 is the answer to it —   */
/*  the screen does not lock while the call is up.                     */
/* ------------------------------------------------------------------ */

/** A stop function. Idempotent, and safe to call after the fact. */
type Release = () => void;

const NOTHING_TO_RELEASE: Release = () => {};

/* ------------------------------------------------------------------ */
/*  1. Screen wake lock                                                */
/* ------------------------------------------------------------------ */

interface WakeLockSentinelLike {
  release: () => Promise<void>;
  addEventListener: (type: string, listener: () => void) => void;
}

/**
 * Holds the screen awake for the length of a call.
 *
 * The lock is dropped by the browser every time the tab is hidden and is
 * NOT handed back on return, so this re-acquires on every trip back to
 * visible. Without that, one glance at a notification would end up
 * costing the rest of the call.
 */
export function holdScreenAwake(): Release {
  if (typeof navigator === "undefined" || typeof document === "undefined") {
    return NOTHING_TO_RELEASE;
  }

  const wakeLock = (
    navigator as Navigator & {
      wakeLock?: { request: (type: string) => Promise<WakeLockSentinelLike> };
    }
  ).wakeLock;

  if (!wakeLock?.request) return NOTHING_TO_RELEASE;

  let sentinel: WakeLockSentinelLike | null = null;
  let stopped = false;

  const acquire = async () => {
    if (stopped || sentinel || document.visibilityState !== "visible") return;

    try {
      const next = await wakeLock.request("screen");
      /* Released while that promise was in flight — hand it straight
         back rather than leaving the screen lit after the call. */
      if (stopped) {
        void next.release().catch(() => {});
        return;
      }
      sentinel = next;
      next.addEventListener("release", () => {
        if (sentinel === next) sentinel = null;
      });
    } catch {
      /* Battery saver, a locked screen, a browser that wants a gesture
         it did not get. The call does not depend on this. */
    }
  };

  const onVisibilityChange = () => {
    if (document.visibilityState === "visible") void acquire();
  };

  void acquire();
  document.addEventListener("visibilitychange", onVisibilityChange);

  return () => {
    stopped = true;
    document.removeEventListener("visibilitychange", onVisibilityChange);
    void sentinel?.release().catch(() => {});
    sentinel = null;
  };
}

/* ------------------------------------------------------------------ */
/*  2. Audio session                                                   */
/* ------------------------------------------------------------------ */

/** iPadOS reports itself as a Mac, so touch points are the tell. */
function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iP(hone|ad|od)/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

/**
 * One second of silence, as a WAV.
 *
 * Built here rather than shipped as a base64 blob for the same reason
 * the ringtone is synthesized: a file fetched over the network is a
 * keep-alive that fails exactly when the connection is bad, which is
 * when a call most needs it.
 */
function silentLoopUrl(): string {
  const rate = 8_000;
  const frames = rate; // one second, looped
  const bytes = frames * 2;
  const buffer = new ArrayBuffer(44 + bytes);
  const view = new DataView(buffer);

  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) {
      view.setUint8(offset + i, text.charCodeAt(i));
    }
  };

  ascii(0, "RIFF");
  view.setUint32(4, 36 + bytes, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true); // PCM header length
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  ascii(36, "data");
  view.setUint32(40, bytes, true);
  /* The samples themselves are already zero — an ArrayBuffer starts
     that way, and zero is silence. */

  return URL.createObjectURL(new Blob([buffer], { type: "audio/wav" }));
}

/**
 * Keeps the tab holding an audio session for as long as the call is up.
 *
 * Silent on purpose: the point is not to be heard, it is to be counted.
 * A tab that owns an audio session keeps its timers and its sockets when
 * it goes to the background, where a quiet one gets frozen.
 *
 * Autoplay can refuse this, and that is fine — every route into a call
 * starts with a click, so in practice the page already holds the
 * activation this needs.
 *
 * NOT ON iOS, deliberately. There a second element starting playback
 * during a call can take over the audio session and re-route the call
 * itself — earpiece instead of speaker, or the far end going quiet —
 * and a keep-alive that degrades the call it is protecting is a bad
 * trade. iOS suspends a locked call regardless of what this element is
 * doing; the wake lock is what actually helps there.
 */
export function keepAudioSessionAlive(): Release {
  if (typeof document === "undefined" || typeof Audio === "undefined") {
    return NOTHING_TO_RELEASE;
  }
  if (isIOS()) return NOTHING_TO_RELEASE;

  let url: string;
  try {
    url = silentLoopUrl();
  } catch {
    return NOTHING_TO_RELEASE;
  }

  const element = new Audio(url);
  element.loop = true;
  /* Left at full volume on purpose. The samples are zero, so there is
     nothing to hear either way, and a muted element is the first thing
     an audibility heuristic discounts — which would cost this the only
     job it has. */
  element.setAttribute("playsinline", "");

  void element.play().catch(() => {
    /* Refused. Costs nothing and changes nothing. */
  });

  return () => {
    try {
      element.pause();
      element.removeAttribute("src");
      element.load();
    } catch {
      /* Already torn down by a navigation. */
    }
    URL.revokeObjectURL(url);
  };
}

/* ------------------------------------------------------------------ */
/*  3. What the lock screen says                                       */
/* ------------------------------------------------------------------ */

/**
 * Puts the call on the OS's media controls.
 *
 * `play` and `pause` are answered with nothing on purpose. An unhandled
 * pause lets the system stop the session outright, and a handled one
 * that hung up would mean a lock-screen pause button quietly ending a
 * conversation. Only `stop` leaves, because only `stop` reads as leaving.
 */
export function announceCall(title: string, onHangUp: () => void): Release {
  if (typeof navigator === "undefined") return NOTHING_TO_RELEASE;

  /* Not optional in the DOM types and very optional in the wild — every
     browser before Chrome 73 and Safari 15 lands on this guard. */
  const session: MediaSession | undefined = navigator.mediaSession;
  if (!session) return NOTHING_TO_RELEASE;

  const previousMetadata = session.metadata;
  const handled: MediaSessionAction[] = [];

  const handle = (action: MediaSessionAction, handler: () => void) => {
    try {
      session.setActionHandler(action, handler);
      handled.push(action);
    } catch {
      /* An action this browser has never heard of. Skip it. */
    }
  };

  try {
    if (typeof MediaMetadata !== "undefined") {
      session.metadata = new MediaMetadata({
        title,
        artist: "OrbitOS",
        album: "Call in progress",
      });
    }
    session.playbackState = "playing";
  } catch {
    /* Metadata is decoration; the handlers below are the useful half. */
  }

  handle("play", () => {});
  handle("pause", () => {});
  handle("stop", onHangUp);

  return () => {
    for (const action of handled) {
      try {
        session.setActionHandler(action, null);
      } catch {
        /* Nothing to unhook. */
      }
    }
    try {
      session.metadata = previousMetadata;
      session.playbackState = "none";
    } catch {
      /* Same. */
    }
  };
}

/* ------------------------------------------------------------------ */
/*  4. The camera, while the phone is face down                        */
/* ------------------------------------------------------------------ */

/** Touch-first devices only — see below. */
function isHandheld(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(hover: none) and (pointer: coarse)").matches;
}

/**
 * Turns the camera off while the tab is hidden, and back on when it is
 * looked at again — but only on phones and tablets.
 *
 * Deliberately NOT on desktop. Alt-tabbing away from a call is normal,
 * constant, and not a request to disappear from the room; a laptop that
 * cut your video every time you checked a document would be worse than
 * one that did nothing at all.
 *
 * Only a camera that was on gets turned back on. Somebody who muted
 * their video and then locked their phone did not ask to be on camera
 * when they unlock it.
 */
export function parkCameraWhileHidden(frame: DailyCall): Release {
  if (typeof document === "undefined" || !isHandheld()) return NOTHING_TO_RELEASE;

  let wasOn = false;

  const onVisibilityChange = () => {
    try {
      if (document.visibilityState === "hidden") {
        wasOn = frame.localVideo();
        if (wasOn) frame.setLocalVideo(false);
        return;
      }

      if (wasOn) {
        frame.setLocalVideo(true);
        wasOn = false;
      }
    } catch {
      /* The room went away between the event and the call. Nothing to
         restore, and nothing worth ending a call over. */
    }
  };

  document.addEventListener("visibilitychange", onVisibilityChange);

  return () => {
    document.removeEventListener("visibilitychange", onVisibilityChange);
  };
}
