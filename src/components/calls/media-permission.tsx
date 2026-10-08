"use client";

import { useCallback, useEffect, useState } from "react";
import { Lock, Mic, Video } from "lucide-react";
import { Loader } from "@/components/ui/loader";

/* ------------------------------------------------------------------ */
/*  Camera and microphone permission                                   */
/*                                                                     */
/*  Asked here, in the app's own UI, before the provider's frame is    */
/*  mounted. The frame is painted by someone else and its permission   */
/*  prompt cannot be restyled beyond a palette — but it only appears   */
/*  while the browser has not decided yet. Settling that first means  */
/*  the room opens straight onto the device preview.                   */
/*                                                                     */
/*  The browser's own prompt still appears after "Allow"; nothing can  */
/*  replace that, and nothing should. This screen is what explains it  */
/*  before it arrives and what helps when it was refused.              */
/* ------------------------------------------------------------------ */

export type MediaPermissionPhase = "checking" | "ask" | "requesting" | "blocked" | "ready";

type PermissionValue = PermissionState | "unknown";

/** Firefox and older Safari cannot be asked about camera permission. */
async function queryPermission(name: "camera" | "microphone"): Promise<PermissionValue> {
  try {
    const status = await navigator.permissions.query({ name: name as PermissionName });
    return status.state;
  } catch {
    return "unknown";
  }
}

/** Opens the devices once so the browser records a decision, then lets go. */
async function requestDevices(): Promise<"granted" | "denied"> {
  const attempt = async (constraints: MediaStreamConstraints) => {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    /* Released immediately: the provider opens its own stream, and a
       second live one keeps the camera light on after the call ends. */
    stream.getTracks().forEach((track) => track.stop());
  };

  try {
    await attempt({ audio: true, video: true });
    return "granted";
  } catch (err: any) {
    if (err?.name === "NotAllowedError" || err?.name === "SecurityError") return "denied";
    /* No camera on this machine, or it is busy in another app. The
       microphone alone is still a call. */
    try {
      await attempt({ audio: true });
      return "granted";
    } catch (inner: any) {
      return inner?.name === "NotAllowedError" ? "denied" : "granted";
    }
  }
}

export function useMediaPermission() {
  const [phase, setPhase] = useState<MediaPermissionPhase>("checking");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        /* No media API at all (an insecure origin, an old browser). The
           provider has its own explanation for that case. */
        if (!cancelled) setPhase("ready");
        return;
      }

      const [camera, mic] = await Promise.all([
        queryPermission("camera"),
        queryPermission("microphone"),
      ]);
      if (cancelled) return;

      if (camera === "granted" && mic === "granted") setPhase("ready");
      else if (mic === "denied") setPhase("blocked");
      else setPhase("ask");
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const request = useCallback(async () => {
    setPhase("requesting");
    const result = await requestDevices();
    setPhase(result === "granted" ? "ready" : "blocked");
  }, []);

  /** Into the room anyway, muted. The provider handles a refused device. */
  const skip = useCallback(() => setPhase("ready"), []);

  return { phase, request, skip };
}

interface MediaPermissionPanelProps {
  phase: Exclude<MediaPermissionPhase, "ready">;
  onAllow: () => void;
  onSkip: () => void;
}

export function MediaPermissionPanel({ phase, onAllow, onSkip }: MediaPermissionPanelProps) {
  if (phase === "checking") {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader />
      </div>
    );
  }

  const blocked = phase === "blocked";
  const requesting = phase === "requesting";

  return (
    <div className="flex h-full items-center justify-center overflow-y-auto p-6">
      <div className="flex w-full max-w-sm animate-fade-in flex-col items-center text-center">
        <div className="mb-6 flex items-center gap-2" aria-hidden>
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-control ring-1 ring-inset ring-line/[0.06]">
            {blocked ? (
              <Lock className="h-[18px] w-[18px] text-orbit-red" />
            ) : (
              <Mic className="h-[18px] w-[18px] text-ink" />
            )}
          </span>
          {!blocked && (
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-control ring-1 ring-inset ring-line/[0.06]">
              <Video className="h-[18px] w-[18px] text-ink" />
            </span>
          )}
        </div>

        <h2 className="mb-2 text-[17px] font-light tracking-tight text-ink">
          {blocked ? "Camera and microphone are blocked" : "Allow your camera and microphone"}
        </h2>
        <p className="mb-8 text-[13px] font-light leading-relaxed text-ink-muted">
          {blocked
            ? "Your browser is not letting this call use them. Click the lock icon beside the address, allow both, then try again."
            : requesting
              ? "Choose Allow in the prompt your browser is showing."
              : "Your browser will ask next. They are only used while you are in this call, and you can mute either one at any time."}
        </p>

        <button
          type="button"
          onClick={onAllow}
          disabled={requesting}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-ink px-4 py-3 text-[13px] font-medium tracking-wide text-on-ink transition-opacity disabled:opacity-40"
        >
          {requesting ? "Waiting for your browser…" : blocked ? "Try again" : "Allow access"}
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="mt-3 w-full rounded-xl px-4 py-2.5 text-[12px] font-light tracking-wide text-ink-dim transition-colors hover:text-ink"
        >
          Join without camera and microphone
        </button>
      </div>
    </div>
  );
}
