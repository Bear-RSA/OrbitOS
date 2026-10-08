"use client";

import { useEffect, useRef } from "react";
import { Clock } from "lucide-react";
import { Loader } from "@/components/ui/loader";
import { lobbyRetryDelay } from "@/lib/calls/lobby";
import type { CallLobby } from "@/types/call";

/* ------------------------------------------------------------------ */
/*  Call lobby                                                         */
/*                                                                     */
/*  Where someone waits for a scheduled call: before the room opens,   */
/*  or before a host from the workspace is in. The page keeps asking   */
/*  and lets them through on its own, so the only instruction is to keep   */
/*  it open. Shared by the member, invited-guest and walk-in paths so  */
/*  all three wait the same way.                                       */
/* ------------------------------------------------------------------ */

/**
 * Calls `retry` again when the lobby says to. Nothing runs while
 * `lobby` is null, and leaving the page cancels the pending attempt.
 */
export function useLobbyRetry(lobby: CallLobby | null, retry: () => void) {
  /* Held in a ref so a retry rebuilt on every render does not reset the
     timer — the wait is keyed on the lobby the server last answered. */
  const retryRef = useRef(retry);
  retryRef.current = retry;

  useEffect(() => {
    if (!lobby) return;
    const timer = setTimeout(() => retryRef.current(), lobbyRetryDelay(lobby));
    return () => clearTimeout(timer);
  }, [lobby]);
}

function openingTime(opensAt: number): string {
  return new Date(opensAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function CallLobbyNotice({ lobby }: { lobby: CallLobby }) {
  const early = lobby.kind === "early";

  return (
    <div role="status" aria-live="polite" className="flex flex-col items-center gap-4 px-6 text-center">
      {early ? <Clock className="h-5 w-5 text-ink-dim" aria-hidden /> : <Loader />}
      <div className="space-y-1.5">
        <p className="text-[15px] font-light tracking-tight text-ink">
          {early ? `The room opens at ${openingTime(lobby.opensAt)}` : "Waiting for the host"}
        </p>
        <p className="max-w-xs text-[12px] font-light leading-relaxed text-ink-muted">
          {early
            ? "Keep this page open. You'll be let in once the room opens and the host joins."
            : "Keep this page open. You'll be let in as soon as the host joins."}
        </p>
      </div>
    </div>
  );
}
