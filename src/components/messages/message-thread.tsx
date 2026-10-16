"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format, isSameDay, isToday, isYesterday } from "date-fns";
import Link from "next/link";
import {
  ArrowUpRight,
  ChevronLeft,
  CircleSlash,
  ClipboardList,
  History,
  ImagePlus,
  Lock,
  Megaphone,
  MessagesSquare,
  Pencil,
  Phone,
  Pin,
  PinOff,
  SendHorizonal,
  Smile,
  Trash2,
  Users,
  Video,
  X,
  Check,
  CheckCheck,
} from "lucide-react";
import { MediaPicker } from "@/components/messages/media-picker";
import { emojiOnlyCount } from "@/lib/messages/emoji";
import {
  ImageSendError,
  imageRefusal,
  pastedImage,
  sendImageMessage,
} from "@/lib/messages/image-upload";
import { CHAT_IMAGE_TYPES } from "@/lib/messages/image-ceiling";
import {
  MESSAGE_PAGE_SIZE,
  loadOlderMessages,
  markConversationRead,
  sendMessage,
  subscribeToMessage,
  subscribeToMessages,
} from "@/lib/queries/messages";
import { notifyMessageAction } from "@/app/actions/messages";
import {
  canViewMessageHistoryAction,
  deleteMessageAction,
  editMessageAction,
  getMessageHistoryAction,
} from "@/app/actions/message-history";
import { foldHistory } from "@/lib/messages/history";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { pinMessageAction } from "@/app/actions/town-hall";
import { TownHallAvatar } from "@/components/messages/town-hall-avatar";
import { TownHallProfileDialog } from "@/components/messages/town-hall-profile-dialog";
import { withdrawNotifications } from "@/lib/notifications/worker";
import {
  canDeleteMessage,
  canEditMessage,
  canManageTownHall,
  canPostToConversation,
} from "@/lib/messages/access";
import { groupCallLive } from "@/lib/calls/access";
import { TASK_STATUS_LABEL, isValidTaskRef } from "@/lib/messages/task-ref";
import { clearedBeforeMs, conversationTitle } from "@/lib/messages/summary";
import { presenceLine, presenceOfMember, presenceTone } from "@/lib/members/presence";
import { useNow } from "@/hooks/use-now";
import { parseDateKey } from "@/lib/utils/dates";
import { MAX_MESSAGE_LENGTH, MAX_PINNED_NOTICES } from "@/lib/validations/messages";
import { UserAvatar } from "@/components/ui/user-avatar";
import { useMemberRank } from "@/hooks/use-member-rank";
import { receiptFor } from "@/lib/messages/receipts";
import { cn } from "@/lib/utils/classnames";
import { tintStyle } from "@/components/ui/department-glass";
import type { DepartmentTint } from "@/lib/members/department-tint";
import type { Member } from "@/types/member";
import {
  TOWN_HALL_NAME,
  type Conversation,
  type Message,
  type MessageAttachment,
  type MessageHistoryEntry,
  type MessageTaskRef,
} from "@/types/message";
import { GlassSurface } from "@/components/ui/glass-surface";

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

/** Remembers whether an owner last posted in Town Hall as the company. */
const AS_COMPANY_KEY = "orbit-townhall-as-company";

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
  /** Each person's department shade, by uid. A dm's header wears the other person's. */
  shades?: ReadonlyMap<string, DepartmentTint>;
  /** Shown while the conversation is still materializing. */
  fallbackTitle?: string;
  subtitle?: string;
  /** Opens someone's profile card. Wired from the banner and every face. */
  onOpenProfile?: (uid: string) => void;
  /** Rings the other person. Only offered in a dm — a room is two people. */
  onCall?: (target: { uid: string; name: string; photoURL?: string | null }) => void;
  /**
   * Opens the group's room, or walks into the one already open.
   *
   * One callback for both, because from here they are the same gesture
   * — the button only changes what it says. Which of the two actually
   * happened is decided on the server, where the thread is read.
   */
  onGroupCall?: (conversationId: string) => void;
  /**
   * Back to the conversation list. Phones show one pane at a time, so the
   * thread carries the way out; from `sm` up both panes are on screen and
   * the button is hidden.
   */
  onBack?: () => void;
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
  shades,
  fallbackTitle = "Conversation",
  subtitle,
  onOpenProfile,
  onCall,
  onGroupCall,
  onBack,
}: MessageThreadProps) {
  const [live, setLive] = useState<Message[]>([]);
  const [older, setOlder] = useState<Message[]>([]);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);

  /* Changing what was said. Both leave the thread looking untouched for
     everyone in it — see `actions/message-history`. */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Message | null>(null);
  const [deleting, setDeleting] = useState(false);

  /* Internal Management's view of edits and deletes. Asked of the server
     once, because who holds the account is not something the client is
     ever told about anybody else. */
  const [mayViewHistory, setMayViewHistory] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<MessageHistoryEntry[]>([]);
  const [openTrail, setOpenTrail] = useState<string | null>(null);

  /* Town Hall as the company: its profile dialog, pinned notices, and
     whether this owner is speaking as the company or as themselves.
     Company is the default — it is the company's channel. */
  const [profileOpen, setProfileOpen] = useState(false);
  const [pinned, setPinned] = useState<Record<string, Message | null>>({});
  const [asCompany, setAsCompanyState] = useState(true);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(AS_COMPANY_KEY) === "me") setAsCompanyState(false);
    } catch {
      /* Storage blocked — the default stands. */
    }
  }, []);

  const setAsCompany = useCallback((next: boolean) => {
    setAsCompanyState(next);
    try {
      window.localStorage.setItem(AS_COMPANY_KEY, next ? "company" : "me");
    } catch {
      /* Storage blocked — the choice lasts for this visit. */
    }
  }, []);

  /* A picture waiting in the composer, and the object URL that draws
     it. Staged rather than sent on paste: a screenshot usually wants a
     sentence with it, and a paste that fires an upload gives nobody a
     chance to notice they grabbed the wrong window. */
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const conversationId = conversation?.id ?? null;

  /* Presence goes stale on its own; without a clock the dot would only
     update when something unrelated re-rendered this. */
  const now = useNow();

  const directory = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const rankOf = useMemberRank();
  const liveNames = useMemo(
    () => Object.fromEntries(members.map((m) => [m.id, m.name])),
    [members]
  );

  const [announcement, setAnnouncement] = useState("");
  const lastSeenIdRef = useRef<string | null | undefined>(undefined);

  /* One listener, bounded, torn down when the thread changes. */
  useEffect(() => {
    if (!conversationId) return;

    setLive([]);
    setOlder([]);
    setExhausted(false);

    /* The first snapshot of a thread is history, not news: it only sets
       the baseline the announcer below compares against. Done here, in
       the listener, because state still holds the previous thread's
       messages for a render after the switch. */
    lastSeenIdRef.current = undefined;
    setAnnouncement("");
    let first = true;
    return subscribeToMessages(conversationId, (messages) => {
      if (first) {
        first = false;
        lastSeenIdRef.current = messages[messages.length - 1]?.id ?? null;
      }
      setLive(messages);
    });
  }, [conversationId]);

  useEffect(() => {
    let cancelled = false;
    void canViewMessageHistoryAction().then((allowed) => {
      if (!cancelled) setMayViewHistory(allowed);
    });
    return () => {
      cancelled = true;
    };
  }, [viewer.id]);

  /* A half-written edit belongs to the thread it was started in. */
  useEffect(() => {
    setEditingId(null);
    setOpenTrail(null);
  }, [conversationId]);

  /* Re-read whenever the transcript changes, since an edit or a delete
     is exactly a change to it. Snapshots only fire on a change, so this
     is one read per edit, send or delete while the view is open. */
  useEffect(() => {
    if (!showHistory || !conversationId) {
      setHistory([]);
      return;
    }
    let cancelled = false;
    void getMessageHistoryAction(conversationId).then((result) => {
      if (cancelled) return;
      if (result.success) setHistory(result.entries);
      else setError(result.error);
    });
    return () => {
      cancelled = true;
    };
  }, [showHistory, conversationId, live]);

  /* Pinned notices, each watched on its own: a pin may sit far above the
     page the transcript has loaded, and an edit to one has to show. */
  const pinnedKey = (conversation?.pinnedMessageIds ?? []).join(",");
  useEffect(() => {
    if (!conversationId || !pinnedKey) {
      setPinned({});
      return;
    }
    const ids = pinnedKey.split(",");
    setPinned({});
    const stops = ids.map((id) =>
      subscribeToMessage(conversationId, id, (message) =>
        setPinned((prev) => ({ ...prev, [id]: message }))
      )
    );
    return () => stops.forEach((stop) => stop());
  }, [conversationId, pinnedKey]);

  /* Screen readers get told when someone else's message lands. */
  useEffect(() => {
    if (lastSeenIdRef.current === undefined || live.length === 0) return;
    const newest = live[live.length - 1];
    if (newest.id === lastSeenIdRef.current) return;
    lastSeenIdRef.current = newest.id;
    if (newest.senderId === viewer.id) return;
    const sender = newest.asCompany
      ? conversation?.name || TOWN_HALL_NAME
      : liveNames[newest.senderId] || "Someone";
    const body = newest.text?.trim();
    setAnnouncement(
      body ? `New message from ${sender}: ${body.slice(0, 140)}` : `New message from ${sender}`
    );
  }, [live, viewer.id, liveNames, conversation?.name]);

  /* A staged picture belongs to the thread it was pasted into. Switching
     threads drops it rather than carrying a screenshot of one
     conversation into another. */
  useEffect(() => {
    setPendingImage(null);
    setPendingPreview(null);
  }, [conversationId]);

  /* Object URLs are held by the document until released; a session of
     pasting and clearing would otherwise keep every abandoned
     screenshot in memory. */
  useEffect(() => {
    if (!pendingPreview) return;
    return () => URL.revokeObjectURL(pendingPreview);
  }, [pendingPreview]);

  /* Anything said before this reader cleared the thread is theirs to
     not see again — the messages are untouched and every other
     participant still has them. */
  const clearedBefore = clearedBeforeMs(conversation, viewer.id);

  const messages = useMemo(
    () =>
      [...older, ...live].filter(
        (m) => (m.createdAt?.toMillis?.() ?? 0) > clearedBefore
      ),
    [older, live, clearedBefore]
  );

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

    /* Read here means read on the phone too: the push card for this
       thread has said all it had to. */
    void withdrawNotifications(`orbit-thread-${conversation.id}`);
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

  const manageTownHall = conversation
    ? canManageTownHall({
        type: conversation.type,
        conversationOrgId: conversation.orgId,
        participantIds: conversation.participantIds ?? [],
        viewerUid: viewer.id,
        viewerOrgId: viewer.orgId,
        viewerRole: viewer.role,
      }).allowed
    : false;
  const postAsCompany = manageTownHall && asCompany;
  const companyName = conversation?.name || TOWN_HALL_NAME;
  const companyPhoto = conversation?.photoURL ?? null;

  const loadEarlier = useCallback(async () => {
    const oldest = messages[0];
    if (!conversationId || !oldest?.createdAt || loadingOlder) return;

    setLoadingOlder(true);
    try {
      const page = await loadOlderMessages(conversationId, oldest.createdAt);

      /* A page that lies entirely before this reader's clear mark is a
         page they will never see, so history ends here for them —
         otherwise the button sits there fetching rows that are filtered
         out and appearing to do nothing. */
      const visible = page.filter(
        (m) => (m.createdAt?.toMillis?.() ?? 0) > clearedBefore
      );
      if (visible.length === 0 || page.length < MESSAGE_PAGE_SIZE) {
        setExhausted(true);
      }
      if (visible.length > 0) setOlder((prev) => [...visible, ...prev]);
    } catch (err) {
      console.error("[MessageThread] Could not load history:", err);
      setError("Could not load earlier messages.");
    } finally {
      setLoadingOlder(false);
    }
  }, [conversationId, messages, loadingOlder, clearedBefore]);

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

  /* Puts a picture in the composer, from the clipboard or the picker.
     Refused here with a sentence, so a 40MB photo is turned away at
     paste time rather than after it has been pushed to Cloudinary. */
  const stageImage = useCallback((file: File) => {
    const refusal = imageRefusal(file);
    if (refusal) {
      setError(refusal);
      return;
    }
    setError(null);
    setPendingImage(file);
    setPendingPreview(URL.createObjectURL(file));
    composerRef.current?.focus();
  }, []);

  const clearImage = useCallback(() => {
    setPendingImage(null);
    setPendingPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const startEdit = useCallback((message: Message) => {
    setEditingId(message.id);
    setEditDraft(message.text);
    setError(null);
  }, []);

  const saveEdit = useCallback(async () => {
    const id = editingId;
    const text = editDraft.trim();
    if (!conversationId || !id || savingEdit) return;
    if (!text) {
      setError("Write something first.");
      return;
    }

    setSavingEdit(true);
    setError(null);
    const result = await editMessageAction({ conversationId, messageId: id, text });
    setSavingEdit(false);

    if (!result.success) {
      setError(result.error);
      return;
    }
    /* The listener covers the latest page; an older page was a one-shot
       read and has to be told. */
    setOlder((prev) => prev.map((m) => (m.id === id ? { ...m, text } : m)));
    setEditingId(null);
  }, [conversationId, editingId, editDraft, savingEdit]);

  const confirmDelete = useCallback(async () => {
    const target = pendingDelete;
    if (!conversationId || !target || deleting) return;

    setDeleting(true);
    const result = await deleteMessageAction({ conversationId, messageId: target.id });
    setDeleting(false);

    if (!result.success) {
      setError(result.error);
      return;
    }
    setOlder((prev) => prev.filter((m) => m.id !== target.id));
    setPendingDelete(null);
  }, [conversationId, pendingDelete, deleting]);

  const togglePin = useCallback(
    async (messageId: string, next: boolean) => {
      if (!conversationId) return;
      setError(null);
      const result = await pinMessageAction({ conversationId, messageId, pinned: next });
      if (!result.success) setError(result.error);
    },
    [conversationId]
  );

  /* The pinned message is often above the loaded page; when it is on
     screen, take the reader to it. */
  const jumpTo = useCallback((messageId: string) => {
    document
      .getElementById(`message-${messageId}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  /* A picture may travel with whatever is already in the box, or on its
     own — picking a GIF mid-sentence sends the sentence with it rather
     than throwing the draft away. A staged upload takes the words as
     its caption the same way; a GIF picked while one is staged sends
     the GIF and leaves the picture where it is. */
  const send = useCallback(
    async (attachment: MessageAttachment | null = null) => {
      const text = draft.trim();
      if (!conversationId || sending || !mayPost) return;
      const image = attachment ? null : pendingImage;
      if (!text && !attachment && !image) return;

      setSending(true);
      setError(null);
      try {
        if (image) {
          await sendImageMessage(conversationId, image, text, postAsCompany);
          clearImage();
        } else {
          const messageId = await sendMessage(
            conversationId,
            viewer.id,
            text,
            attachment,
            postAsCompany
          );
          /* Not awaited: the line is already in the thread, and a push
             to everybody else's phone is no reason to hold the composer. */
          void notifyMessageAction({ conversationId, messageId });
        }
        setDraft("");
      } catch (err) {
        console.error("[MessageThread] Send failed:", err);
        setError(
          err instanceof ImageSendError ? err.message : "That message did not send. Try again."
        );
      } finally {
        setSending(false);
      }
    },
    [conversationId, draft, sending, mayPost, viewer.id, pendingImage, clearImage, postAsCompany]
  );

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
  const partnerPresence = partner ? presenceOfMember(partner, now) : null;

  const partnerTone = partnerPresence ? presenceTone(partnerPresence) : null;
  // "Online" or "Last seen 12 min ago", ahead of their role in the header.
  const partnerLine = partner ? presenceLine(partner, now) : null;
  const headerBanner = conversation?.type === "dm" ? (partner?.bannerURL ?? null) : null;
  const headerShade = conversation?.type === "dm" && partnerUid ? (shades?.get(partnerUid) ?? null) : null;
  const headerSubtitle = partnerLine
    ? [partnerLine, subtitle].filter(Boolean).join(" · ")
    : subtitle;

  /* The dot informs; it does not decide. Presence here is a heartbeat
     heuristic — a tab that has not pulsed in five minutes, or somebody
     who set themselves Offline on purpose — and neither of those means
     unreachable. `IncomingCall` is mounted app-wide and listens on
     Firestore, so a ring lands on any client that has OrbitOS open,
     whatever colour the dot is.

     Which is why this used to be wrong. A button greyed out for
     somebody sitting right there, idle, was refusing a call that would
     have connected. Placing it is the caller's judgement to make; the
     dot is what they make it with. */
  const callReason =
    partnerPresence === "offline"
      ? `${title} looks offline — call anyway`
      : `Call ${title}`;

  /* Whether a room is open beside this thread. Off the same function
     the rail and the server use, against the same clock the presence
     dots read — a call that expired while this pane sat open must stop
     offering a button the server would refuse. */
  const activeCall = conversation?.activeCall ?? null;
  const callLive = conversation?.type === "group" && groupCallLive(activeCall, now);

  /* Who is in the room, by name. The map is a best-effort account — a
     browser that died mid-call never sent its goodbye — so it draws
     faces and decides nothing. */
  const inTheRoom = callLive ? Object.keys(activeCall?.participants ?? {}) : [];
  const viewerInRoom = inTheRoom.includes(viewer.id);

  /* Names, not a count. "3 people are in a call" tells you how many
     colleagues are talking without you; the names tell you whether it
     is a conversation you belong in, which is the thing that decides
     whether anyone clicks Join.

     Resolved through the live directory first, like every other name
     in this file — the copy on the call is a cache for a label. */
  const callRoster = (() => {
    const names = inTheRoom.map(
      (id) => liveNames[id] || activeCall?.participants?.[id] || "Someone"
    );
    if (names.length <= 2) return names.join(" and ");
    return `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
  })();

  /* A full first page means there is probably more behind it. */
  const mayHaveHistory = !exhausted && live.length >= MESSAGE_PAGE_SIZE;

  /* For Internal Management: deleted messages back in place, and each
     edited one's earlier wordings. Ghosts stop at the oldest message
     loaded, so history does not run ahead of "Load earlier". */
  const folded = useMemo(() => {
    if (!showHistory) return null;
    const loadedFrom = mayHaveHistory ? (messages[0]?.createdAt?.toMillis?.() ?? 0) : 0;
    return foldHistory(messages, history, Math.max(loadedFrom, clearedBefore));
  }, [showHistory, messages, history, mayHaveHistory, clearedBefore]);

  const shown = folded?.messages ?? messages;

  /* Delivered and Read, under the last message you sent. Only there:
     a receipt on every line is noise, and the newest one answers the
     question for everything before it. */
  const lastMine = [...shown].reverse().find((m) => m.senderId === viewer.id && !folded?.removed.get(m.id));
  const toMillisMap = (map: Record<string, { toMillis?: () => number }> | undefined) =>
    Object.fromEntries(Object.entries(map ?? {}).map(([uid, at]) => [uid, at?.toMillis?.() ?? null]));
  const receipt =
    conversation && lastMine
      ? receiptFor({
          type: conversation.type,
          senderId: viewer.id,
          sentAtMs: lastMine.createdAt?.toMillis?.() ?? null,
          participantIds: conversation.participantIds ?? [],
          lastReadAt: toMillisMap(conversation.lastReadAt),
          lastDeliveredAt: toMillisMap(conversation.lastDeliveredAt),
        })
      : null;

  return (
    /* The thread is the primary surface and now says so: it sits a rung
       above the rail on the ladder, with a real shadow rather than the
       same flat card treatment on both sides of the screen. */
    <GlassSurface
      fallback="material-fog"
      className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-line/[0.06] shadow-raised ring-1 ring-line/5"
    >
      {/* ── Header ─────────────────────────────────────────────── */}
      {/* In a dm it wears the other person: their banner when they've set
          one, their department's colour when they haven't, the same as
          their profile card. */}
      <header
        style={headerShade && !headerBanner ? tintStyle(headerShade) : undefined}
        className={cn(
          "relative isolate flex shrink-0 items-center gap-3.5 overflow-hidden border-b px-5 py-4 max-sm:gap-2.5 max-sm:pl-2.5",
          headerBanner
            ? "border-line/[0.07]"
            : headerShade
              ? "border-[rgb(var(--tint)/0.18)] bg-[linear-gradient(180deg,rgb(var(--tint)/0.16)_0%,rgb(var(--tint)/0.06)_100%)]"
              : "border-line/[0.05]"
        )}
      >
        {headerBanner && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- already sized and compressed by Cloudinary */}
            <img src={headerBanner} alt="" className="absolute inset-0 -z-20 h-full w-full object-cover object-center" />
            {/* Heavier behind the name, lighter towards the buttons, so the
                text reads over any photo and the photo still shows. */}
            <span
              aria-hidden
              className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgb(var(--base)/0.88)_0%,rgb(var(--base)/0.6)_45%,rgb(var(--base)/0.35)_100%)]"
            />
          </>
        )}
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="All conversations"
            className="-mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-muted transition-colors active:bg-surface-hover hover:bg-surface-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus sm:hidden"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </button>
        )}
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
              <UserAvatar size="lg" name={title} photoURL={partner?.photoURL} rank={rankOf(partner)} />
              {partnerTone && (
                <span
                  className={cn(
                    "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-surface-card",
                    partnerTone
                  )}
                  title={partnerLine ?? undefined}
                  aria-hidden
                />
              )}
            </button>
          ) : (
            <UserAvatar size="lg" name={title} photoURL={partner?.photoURL} rank={rankOf(partner)} />
          )
        ) : conversation?.type === "group" ? (
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-surface-control shadow-card ring-1 ring-line/[0.06]">
            <Users className="h-4 w-4 text-ink-muted" aria-hidden />
          </span>
        ) : (
          <TownHallAvatar size="lg" photoURL={companyPhoto} name={companyName} className="shadow-card" />
        )}

        <ThreadHeading title={title} subtitle={headerSubtitle} />

        {/* A room is two people, so this is offered in a dm and nowhere
            else. Never disabled — see `callReason`. */}
        {conversation?.type === "dm" && partnerUid && onCall && (
          <button
            type="button"
            title={callReason}
            aria-label={callReason}
            onClick={() =>
              onCall({
                uid: partnerUid,
                name: title,
                photoURL: partner?.photoURL,
              })
            }
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-control text-ink-muted ring-1 ring-inset ring-line/[0.06] transition-colors hover:bg-surface-hover hover:text-ink"
          >
            <Phone className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}

        {/* One button, two sentences. Start when the thread is quiet,
            Join when a room is already open — and when it is, it says
            so loudly, because a call happening in a thread you are
            looking at is the most time-sensitive thing on the screen.

            Nothing rang to tell anyone about it: see the note in
            `actions/calls`. This button and the rail's pill are the
            whole of how a group call announces itself. */}
        {conversation?.type === "group" && onGroupCall && (
          <button
            type="button"
            onClick={() => onGroupCall(conversation.id)}
            title={callLive ? "Join the call" : "Start a call"}
            aria-label={callLive ? "Join the call" : "Start a call in this group"}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-lg px-2.5 py-2 text-[11px] font-medium tracking-wide transition-colors",
              callLive
                ? "bg-orbit-green/15 text-orbit-green ring-1 ring-inset ring-orbit-green/25 hover:bg-orbit-green/20"
                : "h-9 w-9 justify-center bg-surface-control px-0 py-0 text-ink-muted ring-1 ring-inset ring-line/[0.06] hover:bg-surface-hover hover:text-ink"
            )}
          >
            {callLive ? (
              <>
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping [animation-iteration-count:3] [animation-fill-mode:forwards] rounded-full bg-orbit-green opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-orbit-green" />
                </span>
                {viewerInRoom ? "Rejoin" : "Join call"}
              </>
            ) : (
              <Video className="h-3.5 w-3.5" aria-hidden />
            )}
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
                  title={person?.name ?? "Unnamed member"}
                  className="rounded-lg ring-2 ring-surface-card transition-transform duration-200 hover:z-10 hover:-translate-y-0.5"
                >
                  <UserAvatar
                    size="sm"
                    name={person?.name ?? "?"}
                    photoURL={person?.photoURL}
                    rank={rankOf(person)}
                  />
                </button>
              );
            })}
            {(conversation.participantIds?.length ?? 0) > 5 && (
              <span className="pl-3.5 font-mono text-[11px] tabular-nums text-ink-dim">
                +{(conversation.participantIds?.length ?? 0) - 5}
              </span>
            )}
          </div>
        )}

        {manageTownHall && conversation && (
          <button
            type="button"
            onClick={() => setProfileOpen(true)}
            title="Edit Town Hall"
            aria-label="Edit Town Hall's name and picture"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-control text-ink-muted ring-1 ring-inset ring-line/[0.06] transition-colors hover:bg-surface-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}

        {mayViewHistory && conversation && (
          <button
            type="button"
            onClick={() => setShowHistory((on) => !on)}
            aria-pressed={showHistory}
            title={showHistory ? "Hide edits and deleted messages" : "Show edits and deleted messages"}
            aria-label={showHistory ? "Hide edits and deleted messages" : "Show edits and deleted messages"}
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
              showHistory
                ? "bg-orbit-amber/15 text-orbit-amber ring-orbit-amber/25"
                : "bg-surface-control text-ink-muted ring-line/[0.06] hover:bg-surface-hover hover:text-ink"
            )}
          >
            <History className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}

        {conversation?.type === "townhall" && (
          <span className="hidden shrink-0 items-center gap-1.5 rounded-md bg-surface-control px-2 py-1 text-[12px] text-ink-dim ring-1 ring-line/[0.06] sm:flex">
            <Megaphone className="h-2.5 w-2.5" aria-hidden />
            Broadcast
          </span>
        )}
      </header>

      {/* ── Live call ──────────────────────────────────────────── */}
      {/* A strip rather than a modal, and rather than a message in the
          transcript. A modal would take the thread away from people who
          are typing in it while two colleagues talk; a message would
          scroll off, which is exactly wrong for a fact that is only
          true right now. So it sits between the header and the
          scrollback, and it leaves when the room does. */}
      {callLive && !viewerInRoom && (
        <div className="flex shrink-0 items-center gap-3 border-b border-orbit-green/15 bg-orbit-green/[0.07] px-5 py-2.5">
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping [animation-iteration-count:3] [animation-fill-mode:forwards] rounded-full bg-orbit-green opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-orbit-green" />
          </span>

          <p className="min-w-0 flex-1 truncate text-[12px] font-light text-ink-muted">
            <span className="font-medium text-ink">{callRoster}</span>
            {inTheRoom.length === 1 ? " is in a call" : " are in a call"}
          </p>

          {onGroupCall && conversation && (
            <button
              type="button"
              onClick={() => onGroupCall(conversation.id)}
              className="shrink-0 rounded-lg bg-orbit-green px-3 py-1.5 text-[11px] font-medium tracking-wide text-white transition-opacity hover:opacity-90"
            >
              Join
            </button>
          )}
        </div>
      )}

      {/* ── Pinned notices ─────────────────────────────────────── */}
      {conversation?.type === "townhall" && (conversation.pinnedMessageIds?.length ?? 0) > 0 && (
        <ul className="flex shrink-0 flex-col gap-1 border-b border-orbit-amber/15 bg-orbit-amber/[0.05] px-5 py-2.5">
          {(conversation.pinnedMessageIds ?? []).map((id) => {
            const notice = pinned[id];
            if (notice === null) return null;
            const author = notice?.asCompany
              ? companyName
              : notice
                ? liveNames[notice.senderId] || "Someone"
                : "";
            const body = notice
              ? notice.text.trim() ||
                (isValidTaskRef(notice.taskRef) ? notice.taskRef.title : "Picture")
              : "Loading…";
            return (
              <li key={id} className="flex min-w-0 items-center gap-2.5">
                <Pin className="h-3 w-3 shrink-0 text-orbit-amber" aria-hidden />
                <button
                  type="button"
                  onClick={() => jumpTo(id)}
                  className="min-w-0 flex-1 truncate text-left text-[12px] text-ink-muted transition-colors hover:text-ink"
                >
                  {author && <span className="font-medium text-ink">{author}: </span>}
                  {body}
                </button>
                {manageTownHall && (
                  <button
                    type="button"
                    onClick={() => void togglePin(id, false)}
                    aria-label="Unpin notice"
                    title="Unpin"
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-ink-faint transition-colors hover:bg-surface-hover hover:text-ink"
                  >
                    <X className="h-3 w-3" aria-hidden />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

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
                className="rounded-full border border-line/[0.06] bg-surface-control px-3 py-1 text-[12px] text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink disabled:opacity-40"
              >
                {loadingOlder ? "Loading…" : "Load earlier"}
              </button>
              <span className="h-px flex-1 bg-line/[0.06]" />
            </div>
          )}

          {showHistory && (
            <p className="mb-4 rounded-lg bg-orbit-amber/[0.07] px-3 py-2 text-center text-[12px] text-ink-muted ring-1 ring-orbit-amber/15">
              Showing edits and deleted messages. Only you can see these.
            </p>
          )}

          {shown.length === 0 ? (
            <EmptyThread type={conversation?.type} mayPost={mayPost} />
          ) : (
            <ol className="flex flex-col">
              {shown.map((message, index) => {
                const previous = shown[index - 1];
                const sender = directory.get(message.senderId);
                const sentAt = message.createdAt?.toDate?.() ?? null;
                const previousAt = previous?.createdAt?.toDate?.() ?? null;
                const mine = message.senderId === viewer.id;
                const company = message.asCompany === true;
                const speakerName = company ? companyName : sender?.name ?? "Unknown member";
                const isPinned = (conversation?.pinnedMessageIds ?? []).includes(message.id);

                const removed = folded?.removed.get(message.id);
                const trail = folded?.edits.get(message.id);
                const editing = editingId === message.id;
                const facts =
                  conversation && !removed
                    ? {
                        type: conversation.type,
                        conversationOrgId: conversation.orgId,
                        participantIds: conversation.participantIds ?? [],
                        viewerUid: viewer.id,
                        viewerOrgId: viewer.orgId,
                        viewerRole: viewer.role,
                        senderId: message.senderId,
                        hasTaskRef: isValidTaskRef(message.taskRef),
                        hasText: message.text.trim().length > 0,
                      }
                    : null;
                const mayEdit = facts ? canEditMessage(facts).allowed : false;
                const mayDelete = facts ? canDeleteMessage(facts).allowed : false;

                /* A new day, or a new voice, starts a block. Consecutive
                   lines from one person are one block — a name and a
                   timestamp above every line makes a monologue
                   unreadable. */
                const newDay = Boolean(
                  sentAt && (!previousAt || !isSameDay(sentAt, previousAt))
                );
                const newSpeaker =
                  newDay ||
                  previous?.senderId !== message.senderId ||
                  (previous?.asCompany === true) !== company;

                /* In a dm the header already names the other person, so
                   repeating it over every block is noise. A group is
                   where the name earns its place. */
                const showName = newSpeaker && (!mine || company) && conversation?.type !== "dm";

                return (
                  <li key={message.id} id={`message-${message.id}`} className="stream-in">
                    {newDay && sentAt && (
                      <div className="my-5 flex items-center gap-3 first:mt-0">
                        <span className="h-px flex-1 bg-line/[0.06]" />
                        <span className="rounded-full bg-surface-control px-2.5 py-0.5 text-[12px] text-ink-dim ring-1 ring-line/[0.05]">
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
                          (company ? (
                            <TownHallAvatar size="sm" photoURL={companyPhoto} name={companyName} />
                          ) : onOpenProfile ? (
                            /* Most useful in a group or Town Hall, where
                               the name above a message may belong to
                               somebody you have not met. */
                            <button
                              type="button"
                              onClick={() => onOpenProfile(message.senderId)}
                              title={`View ${sender?.name ?? "member"}`}
                              className="rounded-lg transition-transform duration-200 hover:-translate-y-0.5"
                            >
                              <UserAvatar
                                size="sm"
                                name={sender?.name ?? "Unknown member"}
                                photoURL={sender?.photoURL}
                                rank={rankOf(sender)}
                              />
                            </button>
                          ) : (
                            <UserAvatar
                              size="sm"
                              name={sender?.name ?? "Unknown member"}
                              photoURL={sender?.photoURL}
                              rank={rankOf(sender)}
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
                                {speakerName}
                              </span>
                            )}
                            {/* Who wrote a company post is the account
                                holder's to know, and the author's own. */}
                            {company && showHistory && !mine && (
                              <span className="text-[11px] text-orbit-amber">
                                by {sender?.name ?? "an owner"}
                              </span>
                            )}
                            {isPinned && (
                              <Pin className="h-3 w-3 self-center text-orbit-amber" aria-label="Pinned" />
                            )}
                            {sentAt && (
                              <span className="font-mono text-[11px] tabular-nums tracking-[0.12em] text-ink-dim">
                                {format(sentAt, "HH:mm")}
                              </span>
                            )}
                          </div>
                        )}

                        <div
                          className={cn(
                            "group/msg flex max-w-full items-center gap-1",
                            mine ? "flex-row-reverse" : "flex-row"
                          )}
                        >
                          <div
                            className={cn(
                              "min-w-0",
                              removed &&
                                "rounded-2xl opacity-60 outline-dashed outline-1 outline-offset-2 outline-orbit-red/40"
                            )}
                          >
                            {editing ? (
                              <EditBox
                                value={editDraft}
                                onChange={setEditDraft}
                                onSave={() => void saveEdit()}
                                onCancel={() => setEditingId(null)}
                                saving={savingEdit}
                              />
                            ) : (
                              <>
                            {message.deletedAt ? (
                              <p className="rounded-2xl border border-dashed border-line/[0.1] px-4 py-2.5 text-[13px] italic text-ink-dim">
                                Message withdrawn
                              </p>
                            ) : isValidTaskRef(message.taskRef) ? (
                              /* A forwarded directive. Ahead of the media
                                 branch because a card never travels with a
                                 GIF, and behind the withdrawn one because a
                                 withdrawn message shows nothing at all. */
                              <ForwardedTask
                                taskRef={message.taskRef}
                                note={message.text}
                                mine={mine}
                              />
                            ) : message.attachment ? (
                              <MessageMedia
                                attachment={message.attachment}
                                caption={message.text}
                                mine={mine}
                              />
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
                              </div>
                            )}
                              </>
                            )}
                          </div>

                          {(mayEdit || mayDelete || (manageTownHall && !removed)) && !editing && (
                            <MessageActions
                              onEdit={mayEdit ? () => startEdit(message) : undefined}
                              onDelete={mayDelete ? () => setPendingDelete(message) : undefined}
                              pinned={isPinned}
                              onPin={
                                manageTownHall && !removed
                                  ? () => void togglePin(message.id, !isPinned)
                                  : undefined
                              }
                            />
                          )}
                        </div>

                        {removed && (
                          <p className="mt-1.5 px-1 text-[11px] text-orbit-red/80">
                            Deleted by {liveNames[removed.actorId] || "an owner"} ·{" "}
                            {format(new Date(removed.atMs), "d MMM, HH:mm")}
                          </p>
                        )}

                        {trail && trail.length > 0 && (
                          <EditTrail
                            entries={trail}
                            open={openTrail === message.id}
                            onToggle={() =>
                              setOpenTrail((current) => (current === message.id ? null : message.id))
                            }
                            align={mine ? "end" : "start"}
                          />
                        )}

                        {receipt && message.id === lastMine?.id && (
                          <p
                            className={cn(
                              "mt-1 flex items-center gap-1 px-1 text-[11px]",
                              receipt.state === "read" ? "text-orbit-blue" : "text-ink-dim"
                            )}
                          >
                            {receipt.state === "sent" || receipt.state === "sending" ? (
                              <Check className="h-3 w-3" aria-hidden />
                            ) : (
                              <CheckCheck className="h-3 w-3" aria-hidden />
                            )}
                            {receipt.label}
                          </p>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}

          <div ref={bottomRef} />
          <p role="status" aria-live="polite" className="sr-only">
            {announcement}
          </p>
        </div>
      </div>

      {/* ── Composer ───────────────────────────────────────────── */}
      <div className="shrink-0 border-t border-line/[0.05] px-4 py-3">
        {error && (
          <p className="mb-2.5 rounded-lg bg-orbit-red/10 px-3 py-2 font-mono text-[11px] text-orbit-red ring-1 ring-orbit-red/20">
            {error}
          </p>
        )}

        {/* Disabled, and says why — the same bargain the Call button in
            the Personnel Network makes. Hiding the composer would make
            Town Hall look broken rather than deliberately one-way. */}
        {mayPost ? (
          <>
          {manageTownHall && (
            <div className="mb-2 flex items-center gap-2 px-1 text-[12px] text-ink-dim">
              <span>Posting as</span>
              <div
                role="radiogroup"
                aria-label="Post as"
                className="flex rounded-lg bg-surface-control p-0.5 ring-1 ring-inset ring-line/[0.06]"
              >
                {[
                  { value: true, label: companyName },
                  { value: false, label: "You" },
                ].map((option) => (
                  <button
                    key={String(option.value)}
                    type="button"
                    role="radio"
                    aria-checked={asCompany === option.value}
                    onClick={() => setAsCompany(option.value)}
                    className={cn(
                      "max-w-[12rem] truncate rounded-md px-2.5 py-1 transition-colors",
                      asCompany === option.value
                        ? "bg-surface-active text-ink shadow-card"
                        : "text-ink-muted hover:text-ink"
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
            className="relative flex flex-col rounded-xl border border-line/[0.06] bg-surface-control p-1.5 shadow-card transition-colors focus-within:border-line/[0.12]"
          >
            {emojiOpen && (
              <MediaPicker
                onInsertEmoji={insertEmoji}
                onSendAttachment={(attachment) => {
                  setEmojiOpen(false);
                  void send(attachment);
                }}
                onClose={() => setEmojiOpen(false)}
              />
            )}

            {/* The staged picture, above the words it will travel with.
                A thumbnail rather than the full image: what needs
                confirming is which screenshot, not what is in it. */}
            {pendingImage && pendingPreview && (
              <div className="mb-1.5 flex items-center gap-3 rounded-lg bg-surface-card/70 p-1.5 pr-2 ring-1 ring-line/[0.06]">
                {/* A blob URL from this browser, not a remote asset —
                    next/image has nothing to optimize here. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={pendingPreview}
                  alt=""
                  className="h-16 w-16 shrink-0 rounded-md bg-surface-control object-cover ring-1 ring-line/[0.06]"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-medium text-ink">
                    {pendingImage.name || "Pasted picture"}
                  </p>
                  <p className="mt-0.5 text-[12px] text-ink-dim">
                    {sending ? "Uploading…" : `${(pendingImage.size / 1024).toFixed(0)} KB · sends with your message`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={clearImage}
                  disabled={sending}
                  aria-label="Remove picture"
                  title="Remove picture"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-faint transition-colors hover:bg-surface-hover hover:text-ink disabled:opacity-40"
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
            )}

            <div className="flex items-end gap-2">
              <button
                type="button"
                onClick={() => setEmojiOpen((open) => !open)}
                aria-label="Emoji, GIFs and stickers"
                aria-expanded={emojiOpen}
                title="Emoji, GIFs and stickers"
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

              {/* Paste is the main road for a screenshot; this is the way
                  in for a file already on disk, and the only one on a
                  phone. */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={sending}
                aria-label="Attach a picture"
                title="Attach a picture — or paste one"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-faint transition-colors hover:bg-surface-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-40"
              >
                <ImagePlus className="h-4 w-4" aria-hidden />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept={Array.from(CHAT_IMAGE_TYPES).join(",")}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) stageImage(file);
                }}
                className="hidden"
              />

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
                /* A picture on the clipboard is staged; anything else
                   falls through to the textarea as text. Only the
                   picture branch prevents default, so pasting a sentence
                   still works as it always did. */
                onPaste={(e) => {
                  const file = pastedImage(e.clipboardData);
                  if (!file) return;
                  e.preventDefault();
                  stageImage(file);
                }}
                rows={1}
                maxLength={MAX_MESSAGE_LENGTH}
                placeholder={pendingImage ? "Add a caption…" : placeholder}
                aria-label="Message"
                disabled={sending || !conversation}
                className="custom-scrollbar max-h-40 flex-1 resize-none bg-transparent px-2.5 py-1.5 text-[13px] leading-relaxed text-ink placeholder:text-ink-dim focus-visible:outline-none disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={sending || (!draft.trim() && !pendingImage) || !conversation}
                aria-label="Send message"
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-all duration-300",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
                  (draft.trim() || pendingImage) && !sending
                    ? "bg-ink text-on-ink hover:-translate-y-px"
                    : "bg-surface-raised text-ink-faint",
                  "disabled:cursor-not-allowed"
                )}
              >
                <SendHorizonal className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
          </form>
          </>
        ) : (
          <div className="flex items-center gap-2.5 rounded-xl border border-dashed border-line/[0.08] bg-surface-control/60 px-3.5 py-3">
            <Lock className="h-3.5 w-3.5 shrink-0 text-ink-dim" aria-hidden />
            <p className="text-[12px] text-ink-dim">
              {decision && decision.allowed === false
                ? decision.message
                : "Opening conversation…"}
            </p>
          </div>
        )}

        {/* Only once it matters — an always-on hint is chrome. */}
        {mayPost && draft.length > MAX_MESSAGE_LENGTH - 200 && (
          <p className="mt-2 text-right text-[12px] text-ink-dim">
            {MAX_MESSAGE_LENGTH - draft.length} characters left
          </p>
        )}
      </div>

      {manageTownHall && conversation && (
        <TownHallProfileDialog
          open={profileOpen}
          townHall={conversation}
          onClose={() => setProfileOpen(false)}
        />
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) setPendingDelete(null);
        }}
        title="Delete this message?"
        description="It disappears for everyone in this conversation, with nothing left in its place."
        confirmText="Delete"
        variant="destructive"
        loading={deleting}
        onConfirm={() => void confirmDelete()}
      />
    </GlassSurface>
  );
}

/* ------------------------------------------------------------------ */
/*  Edit and delete                                                    */
/* ------------------------------------------------------------------ */

/* Shown on hover where there is a pointer, and always — quietly — on a
   touch screen, which has no hover to reveal it with. */
function MessageActions({
  onEdit,
  onDelete,
  onPin,
  pinned = false,
}: {
  onEdit?: () => void;
  onDelete?: () => void;
  /** Town Hall owners only. */
  onPin?: () => void;
  pinned?: boolean;
}) {
  const button =
    "flex h-7 w-7 items-center justify-center rounded-md text-ink-faint transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";

  return (
    <div className="flex shrink-0 items-center opacity-70 transition-opacity focus-within:opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/msg:opacity-100">
      {onPin && (
        <button
          type="button"
          onClick={onPin}
          aria-label={pinned ? "Unpin notice" : "Pin notice"}
          title={pinned ? "Unpin" : `Pin to the top (up to ${MAX_PINNED_NOTICES})`}
          className={cn(button, pinned ? "text-orbit-amber hover:text-ink" : "hover:text-orbit-amber")}
        >
          {pinned ? (
            <PinOff className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <Pin className="h-3.5 w-3.5" aria-hidden />
          )}
        </button>
      )}
      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          aria-label="Edit message"
          title="Edit"
          className={cn(button, "hover:text-ink")}
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden />
        </button>
      )}
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          aria-label="Delete message"
          title="Delete for everyone"
          className={cn(button, "hover:text-orbit-red")}
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
        </button>
      )}
    </div>
  );
}

function EditBox({
  value,
  onChange,
  onSave,
  onCancel,
  saving,
}: {
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  return (
    <div className="w-[min(32rem,70vw)] rounded-2xl bg-surface-control p-2 shadow-card ring-1 ring-line/[0.12]">
      <textarea
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSave();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
        onFocus={(e) => {
          const end = e.currentTarget.value.length;
          e.currentTarget.setSelectionRange(end, end);
        }}
        rows={Math.min(6, Math.max(2, value.split("\n").length))}
        maxLength={MAX_MESSAGE_LENGTH}
        aria-label="Edit message"
        disabled={saving}
        className="custom-scrollbar w-full resize-none bg-transparent px-2 py-1 text-[13px] leading-relaxed text-ink focus-visible:outline-none disabled:opacity-50"
      />
      <div className="mt-1 flex items-center justify-end gap-1.5">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded-md px-2.5 py-1 text-[12px] text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink disabled:opacity-40"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving || !value.trim()}
          className="rounded-md bg-ink px-2.5 py-1 text-[12px] font-medium text-on-ink transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

/* Internal Management's view of how a message read before. */
function EditTrail({
  entries,
  open,
  onToggle,
  align,
}: {
  entries: MessageHistoryEntry[];
  open: boolean;
  onToggle: () => void;
  align: "start" | "end";
}) {
  return (
    <div className={cn("mt-1 flex flex-col px-1", align === "end" ? "items-end" : "items-start")}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="text-[11px] text-orbit-amber transition-opacity hover:opacity-80"
      >
        {open
          ? "Hide earlier versions"
          : `Edited ${entries.length === 1 ? "once" : `${entries.length} times`}`}
      </button>
      {open && (
        <ol className="mt-1.5 flex flex-col gap-1.5">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="rounded-xl border border-dashed border-orbit-amber/25 px-3 py-2"
            >
              <p className="whitespace-pre-wrap break-words text-[12px] leading-relaxed text-ink-muted">
                {entry.text || "(no words)"}
              </p>
              <p className="mt-1 font-mono text-[11px] tabular-nums text-ink-dim">
                Replaced {format(new Date(entry.atMs), "d MMM, HH:mm")}
              </p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

/**
 * A GIF, sticker or uploaded picture in the transcript.
 *
 * The box is reserved from the stored dimensions before the image
 * loads. Without that, every arriving picture reflows the thread out
 * from under whoever is reading it — the one thing a chat window must
 * never do while somebody is mid-sentence.
 *
 * A sticker gets no bubble: transparency is the point of a sticker, and
 * a panel behind it defeats it.
 *
 * An uploaded picture shows its width-limited rendition and opens the
 * original in a new tab. A screenshot is usually text, and text at 320
 * pixels wide is a shape rather than a sentence — the click is how it
 * gets read.
 */
function MessageMedia({
  attachment,
  caption,
  mine,
}: {
  attachment: MessageAttachment;
  caption: string;
  mine: boolean;
}) {
  const isSticker = attachment.kind === "sticker";
  const isImage = attachment.kind === "image";
  const width = Math.min(attachment.width, isSticker ? 180 : 320);
  const ratio = attachment.height / Math.max(attachment.width, 1);

  const picture = (
    /* Deliberately not next/image: the optimizer re-encodes, and a
       re-encoded GIF is a still picture. */
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={isImage ? attachment.previewUrl : attachment.url}
      alt={attachment.alt}
      width={attachment.width}
      height={attachment.height}
      loading="lazy"
      className="h-full w-full object-cover"
      style={{ maxHeight: width * ratio }}
    />
  );

  return (
    <figure className={cn("flex flex-col gap-1.5", mine ? "items-end" : "items-start")}>
      <div
        className={cn(
          "overflow-hidden",
          isSticker ? "rounded-lg" : "rounded-2xl bg-surface-control ring-1 ring-line/[0.06]"
        )}
        style={{ width, aspectRatio: `${attachment.width} / ${attachment.height}` }}
      >
        {isImage ? (
          <a
            href={attachment.url}
            target="_blank"
            rel="noopener noreferrer"
            title="Open full size"
            className="block h-full w-full transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            {picture}
          </a>
        ) : (
          picture
        )}
      </div>

      {caption && (
        <figcaption
          className={cn(
            "max-w-full rounded-2xl px-4 py-2.5 text-[13px] leading-relaxed shadow-card ring-1",
            mine
              ? "bg-surface-active text-ink ring-line/[0.08]"
              : "bg-surface-control text-ink ring-line/[0.06]"
          )}
        >
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

/* ------------------------------------------------------------------ */

/** The pill colours, matching the checklist's own reading of status. */
const TASK_STATUS_TONE: Record<MessageTaskRef["status"], string> = {
  todo: "text-ink-dim ring-line/[0.1]",
  doing: "text-orbit-amber ring-orbit-amber/20",
  done: "text-orbit-green ring-orbit-green/20",
};

/**
 * A directive forwarded into the thread.
 *
 * Drawn as a quotation, not as a live view. Everything on the face of
 * the card is the snapshot taken when it was sent — see the note on
 * `MessageTaskRef` — which is what keeps an old thread readable: a
 * question about a task that was idle in March should still be sitting
 * next to a card that says idle.
 *
 * So the link is the important part. It is the one thing on the card
 * that is not a copy, and it goes to the directive itself, opened in
 * the checklist by its own anchor.
 *
 * The note the sender added rides underneath in an ordinary bubble
 * rather than inside the card. It is a message; the card is the
 * subject, and merging the two would make it unclear which words are
 * the workspace's and which are the sender's.
 */
function ForwardedTask({
  taskRef,
  note,
  mine,
}: {
  taskRef: MessageTaskRef;
  note: string;
  mine: boolean;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", mine ? "items-end" : "items-start")}>
      <Link
        href={`/projects/${taskRef.projectId}#task-${taskRef.taskId}`}
        className={cn(
          "group/task w-full max-w-[22rem] rounded-2xl px-4 py-3 shadow-card ring-1 transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
          mine
            ? "bg-surface-active ring-line/[0.08] hover:bg-surface-raised"
            : "bg-surface-control ring-line/[0.06] hover:bg-surface-raised"
        )}
      >
        <span className="flex items-center gap-1.5 text-[12px] text-ink-dim">
          <ClipboardList className="h-3 w-3" aria-hidden />
          Directive
          <ArrowUpRight
            className="ml-auto h-3 w-3 opacity-0 transition-opacity group-hover/task:opacity-100"
            aria-hidden
          />
        </span>

        <span className="mt-2 block break-words text-[13px] font-medium leading-snug tracking-tight text-ink">
          {taskRef.title}
        </span>

        <span className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[12px] ring-1",
              TASK_STATUS_TONE[taskRef.status]
            )}
          >
            {TASK_STATUS_LABEL[taskRef.status]}
          </span>

          {taskRef.isBlocked && (
            <span className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] text-orbit-red ring-1 ring-orbit-red/20">
              <CircleSlash className="h-2.5 w-2.5" aria-hidden />
              Blocked
            </span>
          )}

          {taskRef.dueDateKey && (
            <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-ink-dim tabular-nums">
              {/* Through `parseDateKey`, which lands at midday — reading
                  the day off the stored instant shifts it by a timezone. */}
              Due {format(parseDateKey(taskRef.dueDateKey), "dd MMM yyyy")}
            </span>
          )}
        </span>

        <span className="mt-2 block truncate text-[12px] text-ink-dim">
          {taskRef.assigneeNames.length > 0
            ? taskRef.assigneeNames.join(", ")
            : "Unassigned"}
        </span>
      </Link>

      {note && (
        <p
          className={cn(
            "max-w-full whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-[13px] leading-relaxed text-ink shadow-card ring-1",
            mine
              ? "bg-surface-active ring-line/[0.08]"
              : "bg-surface-control ring-line/[0.06]"
          )}
        >
          {note}
        </p>
      )}
    </div>
  );
}

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
        <p className="text-[12px] text-ink-dim">
          {isTownHall ? "No notices yet" : "No messages yet"}
        </p>
        <p className="max-w-xs text-[12px] leading-relaxed text-ink-dim">
          {isTownHall
            ? mayPost
              ? "Anything posted here reaches everyone in the workspace."
              : "Notices from owners will appear here."
            : "Say something to get this started."}
        </p>
      </div>
    </div>
  );
}
