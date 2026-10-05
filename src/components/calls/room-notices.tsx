"use client";

import { LogIn, LogOut, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils/classnames";
import type { RoomNotice } from "@/lib/calls/room-notices";

/* ------------------------------------------------------------------ */
/*  Room notices                                                       */
/*                                                                     */
/*  The short stack of cards over the room: who came in, who left,     */
/*  what was said in the chat. Painted by the shell so it is there at  */
/*  full size and in the corner alike — the corner is where it earns   */
/*  its keep, since the provider's own chat panel and roster cannot be */
/*  seen at that size.                                                 */
/*                                                                     */
/*  Rendered AFTER the room's slot and positioned absolutely, so it    */
/*  never shifts the slot and never re-parents the iframe. See the     */
/*  note at the top of `call-shell`.                                   */
/*                                                                     */
/*  Nothing here is interactive and nothing here waits to be           */
/*  dismissed: the hook withdraws each card after a few seconds, and   */
/*  pointer events pass straight through to the room beneath.          */
/* ------------------------------------------------------------------ */

interface RoomNoticesProps {
  notices: RoomNotice[];
  minimized: boolean;
}

const ICONS = {
  joined: LogIn,
  left: LogOut,
  chat: MessageSquare,
} as const;

export function RoomNotices({ notices, minimized }: RoomNoticesProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "pointer-events-none absolute z-10 flex flex-col gap-1.5",
        minimized
          ? "inset-x-2 bottom-2 items-stretch"
          : "bottom-24 left-6 w-[280px] items-start"
      )}
    >
      {notices.map((notice) => {
        const Icon = ICONS[notice.kind];
        return (
          <div
            key={notice.id}
            className={cn(
              "flex max-w-full animate-fade-in items-start gap-2 rounded-xl border border-line/[0.08] bg-surface-container/95 shadow-overlay backdrop-blur-2xl",
              minimized ? "px-2 py-1.5" : "px-3 py-2"
            )}
          >
            <Icon
              className={cn(
                "mt-px shrink-0",
                minimized ? "h-3 w-3" : "h-3.5 w-3.5",
                notice.kind === "left" ? "text-ink-dim" : "text-ink"
              )}
              aria-hidden
            />
            <p
              className={cn(
                "min-w-0 font-light leading-snug text-ink",
                minimized ? "truncate text-[11px]" : "text-[12px]"
              )}
            >
              {notice.kind === "chat" ? (
                <>
                  <span className="font-medium">{notice.name}</span>
                  <span className="text-ink-dim">: </span>
                  <span className={cn(!minimized && "line-clamp-2")}>{notice.text}</span>
                </>
              ) : (
                <>
                  <span className="font-medium">{notice.name}</span>
                  <span className="text-ink-dim">
                    {notice.kind === "joined" ? " joined" : " left"}
                  </span>
                </>
              )}
            </p>
          </div>
        );
      })}
    </div>
  );
}
