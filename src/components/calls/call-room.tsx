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
/*  Daily is the one surface in the product painted by someone else,   */
/*  so its palette is READ from the live theme tokens rather than      */
/*  restated here. A second copy of the palette would be a second      */
/*  thing to remember when `globals.css` changes, and the copy is what */
/*  would rot.                                                         */
/*                                                                     */
/*  Reading computed values also settles the three-way theme setting   */
/*  for free: `dark`, `light` and `system` all resolve to real numbers */
/*  on the root element, so this never has to know which is in force.  */
/*  Daily can key its own theme off `prefers-color-scheme`, but that   */
/*  is the OS asking — a user who picked light while their OS is dark  */
/*  would get a room that disagrees with the app around it.            */
/*                                                                     */
/*  `accent` is the app's ink fill rather than a colour, because the   */
/*  product's primary actions are monochrome in both themes and the    */
/*  call should not be the one screen shouting. orbit-red still lands  */
/*  on the leave button, which Daily paints itself.                    */
/* ------------------------------------------------------------------ */

/** `"5 5 5"` — the channel triplet Tailwind's tokens hold — to `#050505`. */
function channelsToHex(raw: string, fallback: string): string {
  const parts = raw.trim().split(/[\s,/]+/).slice(0, 3).map(Number);
  if (parts.length < 3 || parts.some((n) => !Number.isFinite(n))) return fallback;

  return `#${parts
    .map((n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0"))
    .join("")}`;
}

/**
 * The app's palette, as Daily wants it.
 *
 * Fallbacks are the dark values: if a token is ever renamed the room
 * lands on the original design rather than on Daily's stock blue, which
 * is the same bargain the `:root` block in `globals.css` makes.
 */
function readDailyTheme() {
  const root = getComputedStyle(document.documentElement);
  const token = (name: string, fallback: string) =>
    channelsToHex(root.getPropertyValue(name), fallback);

  const ink = token("--ink", "#EDEDED");
  const control = token("--surface-control", "#141414");

  return {
    colors: {
      accent: ink,
      accentText: token("--on-ink", "#0B0B0B"),
      background: token("--base", "#050505"),
      backgroundAccent: control,
      baseText: ink,
      border: token("--surface-hover", "#1E1E1E"),
      mainAreaBg: token("--surface-card", "#0B0B0B"),
      mainAreaBgAccent: control,
      mainAreaText: ink,
      supportiveText: token("--ink-dim", "#7E7E7E"),
    },
  };
}

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
    let stopWatchingTheme: (() => void) | null = null;

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
          theme: readDailyTheme(),
        });

        /* Follow the theme for as long as the room is open. Someone
           flipping to light mid-call should not be left with a dark room,
           and `system` can change under us without anyone touching the
           app at all — so both the attribute and the OS query are
           watched. Repainting is cheap and does not disturb the call. */
        const repaint = () => {
          try {
            frame?.setTheme?.(readDailyTheme());
          } catch {
            /* A provider that cannot repaint is not a reason to drop a
               call in progress; the room simply keeps the palette it
               opened with. */
          }
        };

        const themeAttr = new MutationObserver(repaint);
        themeAttr.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ["data-theme"],
        });

        const osTheme = window.matchMedia("(prefers-color-scheme: light)");
        osTheme.addEventListener("change", repaint);

        stopWatchingTheme = () => {
          themeAttr.disconnect();
          osTheme.removeEventListener("change", repaint);
        };

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
      stopWatchingTheme?.();
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
