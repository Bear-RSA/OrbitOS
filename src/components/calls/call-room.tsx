"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader } from "@/components/ui/loader";
import { AlertCircle } from "lucide-react";
import type { CallGrant } from "@/types/call";

/* ------------------------------------------------------------------ */
/*  Call room                                                          */
/*                                                                     */
/*  The one client component that touches a media SDK, and the only    */
/*  place a provider is named outside `lib/calls`. It takes a grant    */
/*  and mounts a room; it decides nothing about who may be here,       */
/*  because that was settled on the server before the grant existed.   */
/*                                                                     */
/*  Daily Prebuilt rather than a hand-built call UI. Prebuilt is a     */
/*  device picker, a permissions flow, a grid layout, screen share,    */
/*  and the reconnection behaviour nobody wants to write twice — and   */
/*  none of that is where this product is differentiated. When LiveKit */
/*  replaces Daily this file gains a sibling and a branch, and every   */
/*  gate in front of it is untouched.                                  */
/*                                                                     */
/*  The SDK is imported dynamically so ~200KB of media code stays out  */
/*  of the bundle for the many pages that never open a room.           */
/* ------------------------------------------------------------------ */

interface CallRoomProps {
  grant: CallGrant;
  /** Fires when the participant leaves, by button or by ejection. */
  onLeave?: () => void;
  className?: string;
}

/* ------------------------------------------------------------------ */
/*  Prebuilt theme                                                     */
/*                                                                     */
/*  The hex here mirrors the dark tokens in `globals.css` — this is    */
/*  the one place Daily's UI is painted, and it has to read as part of */
/*  the app rather than a third-party iframe dropped into it. Kept as  */
/*  the DARK palette on purpose regardless of the app's light/dark     */
/*  setting: the call always floats over a `bg-scrim/95` overlay, so a */
/*  light room would clash with the dark chrome framing it.            */
/*                                                                     */
/*  `accent` is the app's near-white ink fill, not a colour, because   */
/*  the product's primary actions are monochrome and the call should   */
/*  not be the one screen shouting in green. orbit-red still lands on  */
/*  the leave button, which Daily paints itself.                       */
/* ------------------------------------------------------------------ */
const DAILY_THEME = {
  colors: {
    accent: "#EDEDED", // --ink
    accentText: "#0B0B0B", // text on an ink fill
    background: "#050505", // --base
    backgroundAccent: "#141414", // --surface-control
    baseText: "#EDEDED", // --ink
    border: "#1E1E1E", // --surface-hover, as a hairline
    mainAreaBg: "#0B0B0B", // --surface-card
    mainAreaBgAccent: "#141414", // --surface-control
    mainAreaText: "#EDEDED", // --ink
    supportiveText: "#7E7E7E", // --ink-dim
  },
} as const;

export function CallRoom({ grant, onLeave, className }: CallRoomProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<"joining" | "joined" | "failed">("joining");
  const [error, setError] = useState<string | null>(null);

  /* Held in a ref so the leave handler can reach the current callback
     without the effect re-running and tearing the room down mid-call. */
  const onLeaveRef = useRef(onLeave);
  onLeaveRef.current = onLeave;

  const fail = useCallback((message: string) => {
    setError(message);
    setStatus("failed");
  }, []);

  useEffect(() => {
    if (grant.provider !== "daily") {
      fail("This call uses a provider this build does not support.");
      return;
    }

    /* A grant that expired while the page sat open would fail inside the
       SDK as an opaque join error. Catching it here says something true. */
    if (grant.expiresAt <= Date.now()) {
      fail("This call pass expired. Reopen the call to get a fresh one.");
      return;
    }

    let cancelled = false;
    let frame: any = null;

    (async () => {
      try {
        const DailyIframe = (await import("@daily-co/daily-js")).default;
        if (cancelled || !containerRef.current) return;

        /* React runs effects twice in development. Daily refuses a second
           instance outright, so anything left over from the first pass is
           torn down before this one builds. */
        const stale = DailyIframe.getCallInstance();
        if (stale) await stale.destroy();
        if (cancelled || !containerRef.current) return;

        frame = DailyIframe.createFrame(containerRef.current, {
          iframeStyle: {
            width: "100%",
            height: "100%",
            border: "0",
            borderRadius: "12px",
          },
          showLeaveButton: true,
          showFullscreenButton: true,
          theme: DAILY_THEME,
        });

        /* Daily Prebuilt renders its own loader and prejoin screen, so our
           overlay has to step aside the moment that UI is up — not when
           join() resolves. With prejoin enabled, join() does not resolve
           until the participant clicks through the prejoin screen, and an
           opaque loader painted on top hides the very Join button they need.
           That is a deadlock that looks exactly like a call stuck on
           "connecting". `loaded` fires once Daily's UI can take the frame. */
        frame.on("loaded", () => {
          if (!cancelled) setStatus("joined");
        });
        frame.on("left-meeting", () => onLeaveRef.current?.());
        frame.on("error", (event: any) => {
          console.error("[CallRoom] Daily error:", event);
          fail(event?.errorMsg || "The call dropped. Try rejoining.");
        });

        await frame.join({
          url: grant.roomUrl,
          token: grant.token,
          userName: grant.displayName,
        });

        /* Belt-and-suspenders: if `loaded` never arrived, a resolved join
           still means Daily owns the frame and the loader must go. */
        if (!cancelled) setStatus("joined");
      } catch (err: any) {
        if (cancelled) return;
        console.error("[CallRoom] Failed to join:", err);
        fail("Could not connect to the call.");
      }
    })();

    return () => {
      cancelled = true;
      // Destroy, never just leave: a surviving iframe keeps the mic open.
      frame?.destroy?.();
    };
  }, [grant, fail]);

  return (
    <div className={className}>
      <div className="relative h-full w-full overflow-hidden rounded-xl bg-surface-card">
        <div ref={containerRef} className="h-full w-full" />

        {status === "joining" && (
          <div className="absolute inset-0 flex items-center justify-center bg-surface-card">
            <Loader />
          </div>
        )}

        {status === "failed" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-surface-card px-6 text-center">
            <AlertCircle className="h-5 w-5 text-orbit-red" aria-hidden />
            <p className="text-[13px] font-light leading-relaxed text-ink-muted">
              {error}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
