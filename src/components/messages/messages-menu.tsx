"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isToday, format } from "date-fns";
import { MessageSquare, Megaphone, Users } from "lucide-react";
import { useUnreadMessages } from "@/hooks/use-unread-messages";
import { conversationTitle } from "@/lib/messages/summary";
import { ActionButton } from "@/components/dashboard/dashboard-card";
import { UserAvatar } from "@/components/ui/user-avatar";
import type { Member } from "@/types/member";
import type { Conversation } from "@/types/message";

/* ------------------------------------------------------------------ */
/*  Messages menu                                                      */
/*                                                                     */
/*  The Messages button, plus what is waiting behind it.               */
/*                                                                     */
/*  TWO SIGNALS, deliberately kept apart:                              */
/*                                                                     */
/*  SEEN — have you been told about this? Local to the device, held in */
/*  localStorage as a high-water mark. Opening the panel sets it, and  */
/*  the badge goes out. This is what "I have noticed" means, and it is */
/*  rightly per-device: being told on your laptop is not being told on */
/*  your phone.                                                        */
/*                                                                     */
/*  READ — have you actually read the thread? That is `lastReadAt` in  */
/*  Firestore, written only when the thread is opened, and it is what  */
/*  drives the dots in the left rail.                                  */
/*                                                                     */
/*  Collapsing the two would mean glancing at a preview marks the      */
/*  message read, and the thread stops looking like it needs an        */
/*  answer — which is how a message gets silently dropped. Keeping     */
/*  them apart means the badge stops nagging while the rail keeps      */
/*  reminding.                                                         */
/* ------------------------------------------------------------------ */

const SEEN_KEY = "orbitos.messages.seenUntil";

/** localStorage is unavailable in private windows and throws when blocked. */
function readSeenUntil(): number {
  try {
    return Number(window.localStorage.getItem(SEEN_KEY)) || 0;
  } catch {
    return 0;
  }
}

function writeSeenUntil(millis: number): void {
  try {
    window.localStorage.setItem(SEEN_KEY, String(millis));
  } catch {
    /* A device that cannot remember simply keeps showing the badge —
       annoying, never wrong. */
  }
}

interface MessagesMenuProps {
  uid: string;
  orgId: string;
  /** The org directory, for resolving dm titles and faces. */
  members: Member[];
  /** Navigates to Messages, optionally straight into one thread. */
  onOpen: (conversationId?: string) => void;
}

export function MessagesMenu({ uid, orgId, members, onOpen }: MessagesMenuProps) {
  const unread = useUnreadMessages(uid, orgId);

  const [open, setOpen] = useState(false);
  const [seenUntil, setSeenUntil] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);

  /* Read after mount, never during render — the server has no
     localStorage, and reading it in render would mismatch hydration. */
  useEffect(() => {
    setSeenUntil(readSeenUntil());
  }, []);

  const newestUnread = useMemo(
    () => unread[0]?.lastMessageAt?.toMillis?.() ?? 0,
    [unread]
  );

  const hasUnseen = newestUnread > seenUntil;

  const liveNames = useMemo(
    () => Object.fromEntries(members.map((m) => [m.id, m.name])),
    [members]
  );

  const directory = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  const toggle = useCallback(() => {
    /* Nothing waiting means there is nothing to show, and a panel that
       opens only to say "nothing unread" is a tap the reader has to
       spend before getting where they were going. With an empty queue
       the button is simply the way into Messages. */
    if (unread.length === 0) {
      onOpen();
      return;
    }

    setOpen((wasOpen) => {
      const next = !wasOpen;
      /* Opening the panel IS being told. The mark is taken from the
         newest message shown, so anything arriving while it is open
         still lights the badge again on close. */
      if (next && newestUnread > 0) {
        setSeenUntil(newestUnread);
        writeSeenUntil(newestUnread);
      }
      return next;
    });
  }, [unread.length, newestUnread, onOpen]);

  /* Click-away and Escape. Bound only while open, so the dashboard is
     not carrying two document listeners it does not need. */
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <ActionButton
        icon={MessageSquare}
        label="Messages"
        variant="ghost"
        collapsed
        badge={hasUnseen}
        badgeLabel={`${unread.length} unread conversation${unread.length === 1 ? "" : "s"}`}
        onClick={toggle}
      />

      {open && (
        <div
          role="dialog"
          aria-label="Unread messages"
          className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-80 overflow-hidden rounded-xl border border-line/[0.06] bg-surface-card shadow-raised ring-1 ring-line/5 backdrop-blur-xl"
        >
          <div className="border-b border-line/[0.04] px-4 py-3">
            <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-dim">
              {unread.length > 0 ? `${unread.length} waiting` : "Messages"}
            </h2>
          </div>

          {unread.length === 0 ? (
            <p className="px-4 py-8 text-center font-mono text-[10px] uppercase tracking-[0.15em] text-ink-dim">
              Nothing unread
            </p>
          ) : (
            <ul className="custom-scrollbar max-h-80 overflow-y-auto p-2">
              {unread.map((conversation) => (
                <li key={conversation.id}>
                  <UnreadRow
                    conversation={conversation}
                    viewerUid={uid}
                    liveNames={liveNames}
                    directory={directory}
                    onClick={() => {
                      setOpen(false);
                      onOpen(conversation.id);
                    }}
                  />
                </li>
              ))}
            </ul>
          )}

          <div className="border-t border-line/[0.04] p-2">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onOpen();
              }}
              className="w-full rounded-lg px-2.5 py-2 text-center font-mono text-[9px] uppercase tracking-[0.15em] text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink"
            >
              Open Messages
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

interface UnreadRowProps {
  conversation: Conversation;
  viewerUid: string;
  liveNames: Record<string, string>;
  directory: Map<string, Member>;
  onClick: () => void;
}

function UnreadRow({
  conversation,
  viewerUid,
  liveNames,
  directory,
  onClick,
}: UnreadRowProps) {
  const title = conversationTitle(conversation, viewerUid, liveNames);
  const sentAt = conversation.lastMessageAt?.toDate?.() ?? null;

  /* In a group or Town Hall the thread name is not the speaker, so the
     preview says who is talking. In a dm the title already is. */
  const speaker =
    conversation.type === "dm"
      ? null
      : conversation.lastMessageBy
        ? liveNames[conversation.lastMessageBy] ||
          conversation.participantNames?.[conversation.lastMessageBy] ||
          null
        : null;

  const partnerUid =
    conversation.type === "dm"
      ? conversation.participantIds?.find((id) => id !== viewerUid)
      : undefined;
  const partner = partnerUid ? directory.get(partnerUid) : undefined;

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-start gap-3 rounded-lg px-2.5 py-2.5 text-left transition-colors hover:bg-surface-hover"
    >
      {conversation.type === "dm" ? (
        <UserAvatar size="sm" name={title} photoURL={partner?.photoURL} />
      ) : (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-surface-control ring-1 ring-line/[0.06]">
          {conversation.type === "group" ? (
            <Users className="h-3.5 w-3.5 text-ink-muted" aria-hidden />
          ) : (
            <Megaphone className="h-3.5 w-3.5 text-ink-muted" aria-hidden />
          )}
        </span>
      )}

      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[13px] font-semibold tracking-tight text-ink-strong">
            {title}
          </span>
          {sentAt && (
            <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.15em] text-ink-dim">
              {isToday(sentAt) ? format(sentAt, "HH:mm") : format(sentAt, "d MMM")}
            </span>
          )}
        </span>
        <span className="mt-0.5 line-clamp-2 block text-[12px] leading-snug text-ink-muted">
          {speaker && <span className="text-ink">{speaker}: </span>}
          {conversation.lastMessagePreview ?? "New message"}
        </span>
      </span>

      <span
        aria-hidden
        className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-orbit-red"
      />
    </button>
  );
}
