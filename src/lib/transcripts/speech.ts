"use client";

/* ------------------------------------------------------------------ */
/*  Web Speech seam                                                    */
/*                                                                     */
/*  The only file that knows how the browser transcribes, in the same  */
/*  spirit as `lib/calls/provider` being the only place a call vendor  */
/*  is named. If this ever moves to provider-side transcription, this  */
/*  file gains a sibling and the hook above it does not change.        */
/*                                                                     */
/*  WHY THE BROWSER AT ALL. The call is a cross-origin Daily Prebuilt  */
/*  iframe, so the app cannot reach the room's mixed audio — there is  */
/*  no getUserMedia and no MediaRecorder anywhere in this codebase to  */
/*  reach it with. What each participant CAN do is listen to their own */
/*  microphone. So everyone transcribes themselves and the server      */
/*  merges the results, which has a property a shared stream could not */
/*  offer: somebody who declines is genuinely not recorded, because    */
/*  their browser never starts.                                        */
/*                                                                     */
/*  The cost of that bargain is coverage, and it is not small. Chrome  */
/*  and Edge are solid, Safari is partial, Firefox has nothing. A      */
/*  participant on Firefox contributes no lines at all — which is why  */
/*  `speechRecognitionSupported` is checked before anyone is asked to  */
/*  consent, and why the rendered transcript names who was captured.   */
/* ------------------------------------------------------------------ */

/* The DOM lib does not declare any of this, and the vendor-prefixed
   half never will. Narrowed to what is actually used rather than
   transcribed from the spec. */

interface SpeechAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechResult {
  readonly length: number;
  isFinal: boolean;
  [index: number]: SpeechAlternative;
}

interface SpeechResultList {
  readonly length: number;
  [index: number]: SpeechResult;
}

interface SpeechRecognitionResultEvent extends Event {
  resultIndex: number;
  results: SpeechResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}

interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function constructorFor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const scope = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

/** Whether this browser can transcribe at all. */
export function speechRecognitionSupported(): boolean {
  return constructorFor() !== null;
}

/**
 * The language to recognise in.
 *
 * The browser's own setting when it states one, because a studio here
 * with a colleague in London should not have both transcribed as one
 * accent. `en-ZA` is the fallback rather than `en-US`: this product
 * prices in rand and its users are here.
 */
export function recognitionLanguage(): string {
  if (typeof navigator === "undefined") return "en-ZA";
  const tag = navigator.language;
  return typeof tag === "string" && tag.length >= 2 ? tag : "en-ZA";
}

/** Why capture stopped for good, in words a person can act on. */
export type SpeechFailure = "denied" | "unsupported" | "unavailable";

export const SPEECH_FAILURE_MESSAGE: Record<SpeechFailure, string> = {
  denied:
    "OrbitOS was not given the microphone, so your side of this call is not being transcribed.",
  unsupported:
    "This browser cannot transcribe speech. Chrome or Edge can; Firefox cannot.",
  unavailable:
    "Speech recognition stopped responding, so your side of this call is not being transcribed.",
};

export interface RecognizerHandle {
  start(): void;
  /** Stops for good. A stopped recognizer is not restarted. */
  stop(): void;
}

export interface RecognizerOptions {
  /** One finished utterance. Interim guesses never reach here. */
  onFinal: (text: string) => void;
  /** Capture has ended and will not resume on its own. */
  onFailure: (failure: SpeechFailure) => void;
}

/**
 * One recognizer, kept alive for as long as it is wanted.
 *
 * The restart loop is the whole substance of this function. Chrome ends
 * continuous recognition by itself after a stretch of quiet — a normal
 * event, not an error — and a recognizer that is not restarted simply
 * stops transcribing halfway through a meeting, with nothing in any log
 * to say why. So `onend` starts it again unless somebody asked it to
 * stop.
 *
 * `no-speech` and `aborted` are the same kind of noise and are swallowed
 * for the same reason. `not-allowed` is different and final: it means
 * this page was refused the microphone, and retrying a permission the
 * user has denied only produces a loop.
 */
export function createRecognizer(options: RecognizerOptions): RecognizerHandle | null {
  const Recognition = constructorFor();
  if (!Recognition) return null;

  let stopped = false;
  let running = false;
  /* Backs off rather than hammering: a recognizer that fails to start
     immediately, over and over, is a busy loop with a microphone in it. */
  let restartDelay = 250;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const recognition = new Recognition();
  recognition.lang = recognitionLanguage();
  recognition.continuous = true;
  /* Finals only. Interim results change under you as the recognizer
     revises its guess, and a transcript is not the place to store a
     sentence that was never said. */
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  const schedule = () => {
    if (stopped || timer) return;
    timer = setTimeout(() => {
      timer = null;
      begin();
    }, restartDelay);
    restartDelay = Math.min(restartDelay * 2, 8_000);
  };

  function begin() {
    if (stopped || running) return;
    try {
      recognition.start();
      running = true;
      restartDelay = 250;
    } catch {
      /* Calling start() on an instance that has not finished stopping
         throws. Waiting and trying again is the way through it. */
      running = false;
      schedule();
    }
  }

  recognition.onresult = (event) => {
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i];
      if (!result?.isFinal) continue;
      const text = result[0]?.transcript ?? "";
      if (text.trim()) options.onFinal(text);
    }
  };

  recognition.onerror = (event) => {
    if (event.error === "not-allowed" || event.error === "service-not-allowed") {
      stopped = true;
      running = false;
      options.onFailure("denied");
      return;
    }
    if (event.error === "audio-capture") {
      stopped = true;
      running = false;
      options.onFailure("unavailable");
      return;
    }
    /* no-speech, aborted, network — all recoverable, and all ordinary
       in a two-hour meeting. onend follows and restarts. */
  };

  recognition.onend = () => {
    running = false;
    if (stopped) return;
    schedule();
  };

  return {
    start: begin,
    stop() {
      stopped = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      try {
        recognition.abort();
      } catch {
        /* Already gone. Nothing to release. */
      }
      running = false;
    },
  };
}
