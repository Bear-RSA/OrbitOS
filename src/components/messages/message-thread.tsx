"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format, isSameDay, isToday, isYesterday } from "date-fns";
import {
  Lock,
  Megaphone,
  MessagesSquare,
  Phone,
  SendHorizonal,
  Smile,
  Users,
} from "lucide-react";
import { EmojiPicker } from "@/components/messages/emoji-picker";
import { emojiOnlyCount } from "@/lib/messages/emoji";
import {
  MESSAGE_PAGE_SIZE,
  loadOlderMessages,
  markConversationRead,
  sendMessage,
  subscribeToMessages,
} from "@/lib/queries/messages";
import { canPostToConversation } from "@/lib/messages/access";
import { conversationTitle } from "@/lib/messages/summary";
import { presenceTone, resolvePresence } from "@/lib/members/presence";
import { useNow } from "@/hooks/use-now";
import { MAX_MESSAGE_LENGTH } from "@/lib/validations/messages";
import { UserAvatar } from "@/components/ui/user-avatar";
import { cn } from "@/lib/utils/classnames";
import type { Member } from "@/types/member";
import type { Conversation, Message } from "@/types/message";

/* ------------------------------------------------------------------ */
/*  Message thread                                                     */
/*                                                                     */
/*  Header, scrollback, composer. It holds exactly one listener — the  */
/*  open thread — and drops it when the conversation changes.          */
/*                                                                     */
/*  Two-sided: your own messages on the right, everyone else's on the  */
/*  left under their face. The single-column arrangement this replaced */
/*  made a thread hard to skim — with every line in one column and     */
/*  only a shade of grey separating them, you had to read a name to    */
/*  know who was talking. Side carries that instantly, and the name is */
/*  then only needed where it is genuinely ambiguous: a group.         */
/*                                                                     */
/*  The transcript is anchored to the BOTTOM. A short conversation     */
/*  pinned to the top of a tall pane reads as an error state; chat     */
/*  grows upward from the composer.                                    */
/*                                                                     */
/*  Sender names are resolved here from the member list the page       */
/*  already holds, rather than read off the message. Nothing is stored */
/*  on a message that its author could have made up: see the note in   */
/*  `types/message`.                                                   */
/* ------------------------------------------------------------------ */

/** Matches the composer's `max-h-40`, in pixels, for the auto-grow. */
const COMPOSER_MAX_HEIGHT = 160;

interface Viewer {
  id: string;
  name: string;
  orgId: string;
  role: string;
  photoURL?: string | null;
}

interface MessageThreadProps {
  conversation: Conversation | null;
  viewer: Viewer;
  members: Member[];
  /** Shown while the conversation is still materializing. */
  fallbackTitle?: string;
  subtitle?: string;
  /** Opens someone's profile card. Wired from the banner and every face. */
  onOpenProfile?: (uid: string) => void;
  /** Rings the other person. Only offered in a dm — a room is two people. */
  onCall?: (target: { uid: string; name: string; photoURL?: string | null }) => void;
}

/** "Today" and "Yesterday" beat a date somebody has to decode. */
function dayLabel(date: Date): string {
  if (isToday(date)) return "Today";
  if (isYesterday(date)) return "Yesterday";
  return format(date, "d MMMM yyyy");
}

export function MessageThread({
  conversation,
  viewer,
  members,
  fallbackTitle = "Conversation",
  subtitle,
  onOpenProfile,
  onCall,
}: MessageThreadProps) {
  const [live, setLive] = useState<Message[]>([]);
  const [older, setOlder] = useState<Message[]>([]);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const conversationId = conversation?.id ?? null;

  /* Presence goes stale on its own; without a clock the dot would only
     update when something unrelated re-rendered this. */
  const now = useNow();

  const directory = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const liveNames = useMemo(
    () => Object.fromEntries(members.map((m) => [m.id, m.name])),
    [members]
  );

  /* One listener, bounded, torn down when the thread changes. */
  useEffect(() => {
    if (!conversationId) return;

    setLive([]);
    setOlder([]);
    setExhausted(false);

    return subscribeToMessages(conversationId, setLive);
  }, [conversationId]);

  const messages = useMemo(() => [...older, ...live], [older, live]);

  /* Follow the transcript down as it grows. */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [live.length, conversationId]);

  /* Grow the composer to fit what is being typed, up to the cap. A
     one-row box that scrolls internally hides the start of your own
     paragraph while you are still writing it. */
  useEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, COMPOSER_MAX_HEIGHT)}px`;
  }, [draft]);

  /* Mark it read once what is on screen is newer than the last receipt.
     Self-limiting: the write moves the receipt past the message, so the
     next run of this effect has nothing left to do. */
  useEffect(() => {
    if (!conversation) return;

    const lastMessage = conversation.lastMessageAt?.toMillis?.() ?? 0;
    const lastRead = conversation.lastReadAt?.[viewer.id]?.toMillis?.() ?? 0;
    if (lastMessage === 0 || lastRead >= lastMessage) return;

    void markConversationRead(conversation.id, viewer.id).catch((err) =>
      console.error("[MessageThread] Could not mark read:", err)
    );
  }, [conversation, viewer.id]);

  const decision = conversation
    ? canPostToConversation({
        type: conversation.type,
        conversationOrgId: conversation.orgId,
        participantIds: conversation.participantIds ?? [],
        viewerUid: viewer.id,
        viewerOrgId: viewer.orgId,
        viewerRole: viewer.role,
      })
    : null;

  const mayPost = decision?.allowed === true;

  const loadEarlier = useCallback(async () => {
    const oldest = messages[0];
    if (!conversationId || !oldest?.createdAt || loadingOlder) return;

    setLoadingOlder(true);
    try {
      const page = await loadOlderMessages(conversationId, oldest.createdAt);
      if (page.length < MESSAGE_PAGE_SIZE) setExhausted(true);
      setOlder((prev) => [...page, ...prev]);
    } catch (err) {
      console.error("[MessageThread] Could not load history:", err);
      setError("Could not load earlier messages.");
    } finally {
      setLoadingOlder(false);
    }
  }, [conversationId, messages, loadingOlder]);

  /* Inserted at the caret, not appended. Somebody who moved back to fix
     a word and then reached for the picker means it to land where they
     are looking, and the selection is restored after it so typing
     continues from the right place. */
  const insertEmoji = useCallback((emoji: string) => {
    const el = composerRef.current;

    setDraft((current) => {
      const start = el?.selectionStart ?? current.length;
      const end = el?.selectionEnd ?? current.length;
      const next = current.slice(0, start) + emoji + current.slice(end);

      /* After React has written the new value — setting it now would be
         overwritten by the re-render. */
      queueMicrotask(() => {
        if (!el) return;
        const caret = start + emoji.length;
        el.focus();
        el.setSelectionRange(caret, caret);
      });

      return next;
    });
  }, []);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!conversationId || !text || sending || !mayPost) return;

    setSending(true);
    setError(null);
    try {
      await sendMessage(conversationId, viewer.id, text);
      setDraft("");
    } catch (err) {
      console.error("[MessageThread] Send failed:", err);
      setError("That message did not send. Try again.");
    } finally {
      setSending(false);
    }
  }, [conversationId, draft, sending, mayPost, viewer.id]);

  const title = conversation
    ? conversationTitle(conversation, viewer.id, liveNames)
    : fallbackTitle;

  /* A dm is headed by the person on the other end, so it gets their
     face rather than an icon — the same thing the rail and the
     Personnel Network show, so the three agree at a glance. */
  const partnerUid =
    conversation?.type === "dm"
      ? conversation.participantIds?.find((id) => id !== viewer.id)
      : undefined;
  const partner = partnerUid ? directory.get(partnerUid) : undefined;

  const placeholder =
    conversation?.type === "townhall" ? "Post a notice…" : `Message ${title}…`;

  /* Derived from the heartbeat, not from the stored status — see
     `lib/members/presence`. The same call every other surface makes, so
     a person cannot read as available here and offline in the rail. */
  const partnerPresence = partner
    ? resolvePresence(
        {
          operationalStatus: partner.operationalStatus,
          lastActivityMs: partner.lastActivity?.toMillis?.() ?? null,
        },
        now
      )
    : null;

  const partnerTone = partnerPresence ? presenceTone(partnerPresence) : null;

  /* Ringing somebody who is gone is worse than waiting, so the button
     stays and says why. */
  const callBlocked = partnerPresence === "offline";
  const callReason = callBlocked ? `${title} is offline` : `Call ${title}`;

  /* A full first page means there is probably more behind it. */
  const mayHaveHistory = !exhausted && live.length >= MESSAGE_PAGE_SIZE;

  return (
    /* The thread is the primary surface and now says so: it sits a rung
       above the rail on the ladder, with a real shadow rather than the
       same flat card treatment on both sides of the screen. */
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-line/[0.05] bg-surface-card shadow-raised">
      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="flex shrink-0 items-center gap-3.5 border-b border-line/[0.05] bg-surface-card/70 px-5 py-4">
        {/* The picture opens the person — here, in the rail, and on every
            message. One rule, so it never has to be discovered twice. */}
        {conversation?.type === "dm" ? (
          partnerUid && onOpenProfile ? (
            <button
              type="button"
              onClick={() => onOpenProfile(partnerUid)}
              title={`View ${title}`}
              aria-label={`View ${title}`}
              className="relative shrink-0 rounded-xl transition-transform duration-200 hover:-translate-y-[2px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              <UserAvatar size="lg" name={title} photoURL={partner?.photoURL} />
              {partnerTone && (
                <span
                  className={cn(
                    "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-surface-card",
                    partnerTone
                  )}
                />
              )}
            </button>
          ) : (
            <UserAvatar size="lg" name={title} photoURL={partner?.photoURL} />
          )
        ) : (
          <span
            className={cn(
              "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl shadow-card ring-1 ring-line/[0.06]",
              conversation?.type === "townhall"
                ? "bg-orbit-amber/10 ring-orbit-amber/20"
                : "bg-surface-control"
            )}
          >
            {conversation?.type === "group" ? (
              <Users className="h-4 w-4 text-ink-muted" aria-hidden />
            ) : (
              <Megaphone className="h-4 w-4 text-orbit-amber" aria-hidden />
            )}
          </span>
        )}

        <ThreadHeading title={title} subtitle={subtitle} />

        {/* A room is two people, so this is offered in a dm and nowhere
            else. Disabled with a reason rather than hidden, the same
            bargain the Personnel Network makes. */}
        {conversation?.type === "dm" && partnerUid && onCall && (
          <button
            type="button"
            disabled={callBlocked}
            title={callReason}
            aria-label={callReason}
            onClick={() =>
              onCall({
                uid: partnerUid,
                name: title,
                photoURL: partner?.photoURL,
              })
            }
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-control text-ink-muted ring-1 ring-inset ring-line/[0.06] transition-colors hover:bg-surface-hover hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
          >
            <Phone className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}

        {/* A group's members, each a way into their card. */}
        {conversation?.type === "group" && onOpenProfile && (
          <div className="hidden shrink-0 items-center -space-x-2 sm:flex">
            {(conversation.participantIds ?? []).slice(0, 5).map((id) => {
              const person = directory.get(id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onOpenProfile(id)}
                  title={person?.name ?? "Operative"}
                  className="rounded-lg ring-2 ring-surface-card transition-transform duration-200 hover:z-10 hover:-translate-y-0.5"
                >
                  <UserAvatar
                    size="sm"
                    name={person?.name ?? "?"}
                    photoURL={person?.photoURL}
                  />
                </button>
              );
            })}
            {(conversation.participantIds?.length ?? 0) > 5 && (
              <span className="pl-3.5 font-mono text-[9px] tabular-nums text-ink-dim">
                +{(conversation.participantIds?.length ?? 0) - 5}
              </span>
            )}
          </div>
        )}

        {conversation?.type === "townhall" && (
          <span className="hidden shrink-0 items-center gap-1.5 rounded-md bg-surface-control px-2 py-1 font-mono text-[9px] uppercase tracking-[0.15em] text-ink-dim ring-1 ring-line/[0.06] sm:flex">
            <Megaphone className="h-2.5 w-2.5" aria-hidden />
            Broadcast
          </span>
        )}
      </header>

      {/* ── Transcript ─────────────────────────────────────────── */}
      <div className="custom-scrollbar flex-1 overflow-y-auto px-5 py-5">
        {/* `min-h-full` + `justify-end` is what pins a short thread to
            the composer instead of stranding it at the top. */}
        <div className="flex min-h-full flex-col justify-end">
          {mayHaveHistory && (
            <div className="mb-6 flex items-center gap-3">
              <span className="h-px flex-1 bg-line/[0.06]" />
              <button
                type="button"
                onClick={loadEarlier}
                disabled={loadingOlder}
                className="rounded-full border border-line/[0.06] bg-surface-control px-3 py-1 font-mono text-[9px] uppercase tracking-[0.15em] text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink disabled:opacity-40"
              >
                {loadingOlder ? "Loading…" : "Load earlier"}
              </button>
              <span className="h-px flex-1 bg-line/[0.06]" />
            </div>
          )}

          {messages.length === 0 ? (
            <EmptyThread type={conversation?.type} mayPost={mayPost} />
          ) : (
            <ol className="flex flex-col">
              {messages.map((message, index) => {
                const previous = messages[index - 1];
                const sender = directory.get(message.senderId);
                const sentAt = message.createdAt?.toDate?.() ?? null;
                const previousAt = previous?.createdAt?.toDate?.() ?? null;
                const mine = message.senderId === viewer.id;

                /* A new day, or a new voice, starts a block. Consecutive
                   lines from one person are one block — a name and a
                   timestamp above every line makes a monologue
                   unreadable. */
                const newDay = Boolean(
                  sentAt && (!previousAt || !isSameDay(sentAt, previousAt))
                );
                const newSpeaker = newDay || previous?.senderId !== message.senderId;

                /* In a dm the header already names the other person, so
                   repeating it over every block is noise. A group is
                   where the name earns its place. */
                const showName = newSpeaker && !mine && conversation?.type !== "dm";

                return (
                  <li key={message.id} className="stream-in">
                    {newDay && sentAt && (
                      <div className="my-5 flex items-center gap-3 first:mt-0">
                        <span className="h-px flex-1 bg-line/[0.06]" />
                        <span className="rounded-full bg-surface-control px-2.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.18em] text-ink-dim ring-1 ring-line/[0.05]">
                          {dayLabel(sentAt)}
                        </span>
                        <span className="h-px flex-1 bg-line/[0.06]" />
                      </div>
                    )}

                    <div
                      className={cn(
                        "flex gap-2.5",
                        mine ? "flex-row-reverse" : "flex-row",
                        newSpeaker ? "mt-4" : "mt-1"
                      )}
                    >
                      {/* Reserved even when empty, so a block's second and
                          third lines stay aligned under the first. */}
                      <div className="w-8 shrink-0">
                        {!mine &&
                          newSpeaker &&
                          (onOpenProfile ? (
                            /* Most useful in a group or Town Hall, where
                               the name above a message may belong to
                               somebody you have not met. */
                            <button
                              type="button"
                              onClick={() => onOpenProfile(message.senderId)}
                              title={`View ${sender?.name ?? "operative"}`}
                              className="rounded-lg transition-transform duration-200 hover:-translate-y-0.5"
                            >
                              <UserAvatar
                                size="sm"
                                name={sender?.name ?? "Unknown operative"}
                                photoURL={sender?.photoURL}
                              />
                            </button>
                          ) : (
                            <UserAvatar
                              size="sm"
                              name={sender?.name ?? "Unknown operative"}
                              photoURL={sender?.photoURL}
                            />
                          ))}
                      </div>

                      <div
                        className={cn(
                          "flex min-w-0 flex-col",
                          "max-w-[min(68%,40rem)]",
                          mine ? "items-end" : "items-start"
                        )}
                      >
                        {newSpeaker && (
                          <div className="mb-1 flex items-baseline gap-2 px-1">
                            {showName && (
                              <span className="text-[12px] font-medium tracking-tight text-ink-strong">
                                {sender?.name ?? "Unknown operative"}
                              </span>
                            )}
                            {sentAt && (
                              <span className="font-mono text-[9px] tabular-nums tracking-[0.12em] text-ink-dim">
                                {format(sentAt, "HH:mm")}
                              </span>
                            )}
                          </div>
                        )}

                        {message.deletedAt ? (
                          <p className="rounded-2xl border border-dashed border-line/[0.1] px-4 py-2.5 text-[13px] italic text-ink-dim">
                            Message withdrawn
                          </p>
                        ) : emojiOnlyCount(message.text) > 0 ? (
                          /* A lone 👍 is a gesture, not a sentence. At
                             body size inside a bubble it reads as a
                             typo; given room it reads as the answer it
                             is. No bubble, because there is no text for
                             one to contain. */
                          <p
                            className={cn(
                              "px-1 leading-none",
                              emojiOnlyCount(message.text) === 1
                                ? "text-[40px]"
                                : "text-[30px]"
                            )}
                          >
                            {message.text}
                          </p>
                        ) : (
                          <div
                            className={cn(
                              "rounded-2xl px-4 py-2.5 shadow-card ring-1",
                              /* Yours sits well up the surface ladder so
                                 the two sides read apart at a glance, not
                                 only on inspection. */
                              mine
                                ? "bg-surface-active ring-line/[0.08]"
                                : "bg-surface-control ring-line/[0.06]",
                              /* A squared corner on the side the block
                                 comes from — the bubble points at its
                                 author. */
                              newSpeaker && (mine ? "rounded-tr-md" : "rounded-tl-md")
                            )}
                          >
                            <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-ink">
                              {message.text}
                            </p>
                            {message.editedAt && (
                              <span className="mt-1 block font-mono text-[9px] uppercase tracking-[0.15em] text-ink-faint">
                                edited
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* ── Composer ───────────────────────────────────────────── */}
      <div className="shrink-0 border-t border-line/[0.05] bg-surface-card/60 px-4 py-3">
        {error && (
          <p className="mb-2.5 rounded-lg bg-orbit-red/10 px-3 py-2 font-mono text-[11px] text-orbit-red ring-1 ring-orbit-red/20">
            {error}
          </p>
        )}

        {/* Disabled, and says why — the same bargain the Call button in
            the Personnel Network makes. Hiding the composer would make
            Town Hall look broken rather than deliberately one-way. */}
        {mayPost ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
            className="relative flex items-end gap-2 rounded-xl border border-line/[0.06] bg-surface-control p-1.5 shadow-card transition-colors focus-within:border-line/[0.12]"
          >
            {emojiOpen && (
              <EmojiPicker
                onSelect={insertEmoji}
                onClose={() => setEmojiOpen(false)}
              />
            )}

            <button
              type="button"
              onClick={() => setEmojiOpen((open) => !open)}
              aria-label="Add an emoji"
              aria-expanded={emojiOpen}
              title="Add an emoji"
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
                emojiOpen
                  ? "bg-surface-hover text-ink"
                  : "text-ink-faint hover:bg-surface-hover hover:text-ink"
              )}
            >
              <Smile className="h-4 w-4" aria-hidden />
            </button>

            <textarea
              ref={composerRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              rows={1}
              maxLength={MAX_MESSAGE_LENGTH}
              placeholder={placeholder}
              aria-label="Message"
              disabled={sending || !conversation}
              className="custom-scrollbar max-h-40 flex-1 resize-none bg-transparent px-2.5 py-1.5 text-[13px] leading-relaxed text-ink placeholder:text-ink-dim focus-visible:outline-none disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={sending || !draft.trim() || !conversation}
              aria-label="Send message"
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-all duration-300",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
                draft.trim() && !sending
                  ? "bg-ink text-on-ink hover:-translate-y-px"
                  : "bg-surface-raised text-ink-faint",
                "disabled:cursor-not-allowed"
              )}
            >
              <SendHorizonal className="h-3.5 w-3.5" aria-hidden />
            </button>
          </form>
        ) : (
          <div className="flex items-center gap-2.5 rounded-xl border border-dashed border-line/[0.08] bg-surface-control/60 px-3.5 py-3">
            <Lock className="h-3.5 w-3.5 shrink-0 text-ink-dim" aria-hidden />
            <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-ink-dim">
              {decision && decision.allowed === false
                ? decision.message
                : "Opening conversation…"}
            </p>
          </div>
        )}

        {/* Only once it matters — an always-on hint is chrome. */}
        {mayPost && draft.length > MAX_MESSAGE_LENGTH - 200 && (
          <p className="mt-2 text-right font-mono text-[9px] uppercase tracking-[0.15em] text-ink-dim">
            {MAX_MESSAGE_LENGTH - draft.length} characters left
          </p>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function ThreadHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="min-w-0 flex-1">
      <h1 className="truncate text-[15px] font-medium tracking-tight text-ink-strong">{title}</h1>
      {subtitle && (
        <p className="mt-0.5 truncate text-[11px] text-ink-dim">{subtitle}</p>
      )}
    </div>
  );
}

function EmptyThread({
  type,
  mayPost,
}: {
  type?: Conversation["type"];
  mayPost: boolean;
}) {
  const isTownHall = type === "townhall";

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-control shadow-card ring-1 ring-line/[0.06]">
        {isTownHall ? (
          <Megaphone className="h-5 w-5 text-ink-faint" aria-hidden />
        ) : (
          <MessagesSquare className="h-5 w-5 text-ink-faint" aria-hidden />
        )}
      </span>
      <div className="space-y-1.5">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-dim">
          {isTownHall ? "No notices yet" : "No messages yet"}
        </p>
        <p className="max-w-xs text-[12px] leading-relaxed text-ink-faint">
          {isTownHall
            ? mayPost
              ? "Anything posted here reaches everyone in the workspace."
              : "Notices from the owner will appear here."
            : "Say something to get this started."}
        </p>
      </div>
    </div>
  );
}
