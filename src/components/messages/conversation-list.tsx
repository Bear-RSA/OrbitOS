"use client";

import { useMemo } from "react";
import { Megaphone, Plus, Users } from "lucide-react";
import { conversationTitle, conversationUnread } from "@/lib/messages/summary";
import { UserAvatar } from "@/components/ui/user-avatar";
import { cn } from "@/lib/utils/classnames";
import { TOWN_HALL_NAME, type Conversation } from "@/types/message";
import type { Member } from "@/types/member";

/* ------------------------------------------------------------------ */
/*  Conversation list                                                  */
/*                                                                     */
/*  The left rail, in two sections.                                    */
/*                                                                     */
/*  CHATS is Town Hall pinned first, then everything from the          */
/*  `participantIds` query in most-recent order. Town Hall is pinned   */
/*  rather than sorted in because it is not in that query at all — it  */
/*  has no participant list to match on — so it arrives from its own   */
/*  listener and has no `lastMessageAt` to sort against the rest.      */
/*                                                                     */
/*  PEOPLE is the live org directory, the same `subscribeToMembers-    */
/*  ByOrg` the dashboard and the Personnel Network use. Clicking a     */
/*  name opens the dm with them, creating it on the way if this is the */
/*  first time — which is why the rail asks the page to do it rather   */
/*  than writing anything itself.                                      */
/*                                                                     */
/*  It renders and reports clicks. Selection, tab, and the dm/group    */
/*  round trips all live on the page, so this component holds no state */
/*  that could disagree with what the thread pane is showing.          */
/* ------------------------------------------------------------------ */

export type ConversationTab = "chats" | "people";

interface ConversationListProps {
  viewerUid: string;
  /** The org directory, for resolving dm titles and avatars. */
  members: Member[];
  /** The directory without the viewer, in the order People should show. */
  people: Member[];
  townHallId: string | null;
  townHall: Conversation | null;
  /** Dms and groups, newest activity first. */
  threads: Conversation[];
  selectedId: string | null;
  tab: ConversationTab;
  /** Uid of the person whose dm is currently being opened. */
  opening: string | null;
  onTabChange: (tab: ConversationTab) => void;
  onSelect: (conversationId: string) => void;
  onOpenDm: (uid: string) => void;
  onCreateGroup: () => void;
}

export function ConversationList({
  viewerUid,
  members,
  people,
  townHallId,
  townHall,
  threads,
  selectedId,
  tab,
  opening,
  onTabChange,
  onSelect,
  onOpenDm,
  onCreateGroup,
}: ConversationListProps) {
  const liveNames = useMemo(
    () => Object.fromEntries(members.map((m) => [m.id, m.name])),
    [members]
  );

  const directory = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  return (
    <nav
      aria-label="Conversations"
      className="hidden w-64 shrink-0 flex-col overflow-hidden rounded-xl border border-line/[0.06] bg-surface-card/40 shadow-raised ring-1 ring-line/5 backdrop-blur-sm sm:flex"
    >
      <div
        role="tablist"
        aria-label="Conversations and people"
        className="flex shrink-0 border-b border-line/[0.04]"
      >
        {(["chats", "people"] as ConversationTab[]).map((name) => (
          <button
            key={name}
            role="tab"
            aria-selected={tab === name}
            onClick={() => onTabChange(name)}
            className={cn(
              "flex-1 px-4 py-3 font-mono text-[10px] uppercase tracking-[0.2em] transition-colors",
              tab === name ? "bg-surface-raised text-ink" : "text-ink-dim hover:text-ink-muted"
            )}
          >
            {name}
          </button>
        ))}
      </div>

      {tab === "chats" && (
        <div className="shrink-0 border-b border-line/[0.04] p-2">
          {/* No approval and no role check — any member may start a
              group, the same way any member may ring a colleague. */}
          <button
            type="button"
            onClick={onCreateGroup}
            className="flex w-full items-center gap-2 rounded-lg border border-line/[0.06] bg-surface-control px-2.5 py-2 font-mono text-[9px] uppercase tracking-[0.15em] text-ink-muted transition-colors hover:bg-surface-raised hover:text-ink"
          >
            <Plus className="h-3 w-3" aria-hidden />
            New group
          </button>
        </div>
      )}

      <ul className="custom-scrollbar flex-1 overflow-y-auto p-2">
        {tab === "chats" ? (
          <>
            <li>
              {/* Pinned, always first, and always present — Town Hall is
                  the one thread nobody joins or leaves. */}
              <ConversationRow
                title={TOWN_HALL_NAME}
                preview={townHall?.lastMessagePreview ?? `${members.length} in the workspace`}
                previewStyle={townHall?.lastMessagePreview ? "text" : "label"}
                selected={selectedId === townHallId}
                unread={townHall ? conversationUnread(townHall, viewerUid) : false}
                onClick={() => townHallId && onSelect(townHallId)}
                icon={<Megaphone className="h-3.5 w-3.5 text-ink-muted" aria-hidden />}
              />
            </li>

            {threads.map((conversation) => {
              const title = conversationTitle(conversation, viewerUid, liveNames);
              const partnerUid = conversation.participantIds?.find((id) => id !== viewerUid);
              const partner = partnerUid ? directory.get(partnerUid) : undefined;

              return (
                <li key={conversation.id}>
                  <ConversationRow
                    title={title}
                    preview={conversation.lastMessagePreview ?? "No messages yet"}
                    previewStyle={conversation.lastMessagePreview ? "text" : "label"}
                    selected={selectedId === conversation.id}
                    unread={conversationUnread(conversation, viewerUid)}
                    onClick={() => onSelect(conversation.id)}
                    icon={
                      conversation.type === "group" ? (
                        <Users className="h-3.5 w-3.5 text-ink-muted" aria-hidden />
                      ) : undefined
                    }
                    avatar={
                      conversation.type === "dm"
                        ? { name: title, photoURL: partner?.photoURL }
                        : undefined
                    }
                  />
                </li>
              );
            })}
          </>
        ) : people.length === 0 ? (
          <li className="px-2.5 py-6 text-center font-mono text-[10px] uppercase tracking-[0.15em] text-ink-dim">
            Nobody else here yet
          </li>
        ) : (
          people.map((member) => (
            <li key={member.id}>
              <ConversationRow
                title={member.name}
                preview={
                  member.roleDescriptor || (member.role === "OWNER" ? "Owner" : "Member")
                }
                selected={false}
                unread={false}
                busy={opening === member.id}
                onClick={() => onOpenDm(member.id)}
                avatar={{ name: member.name, photoURL: member.photoURL }}
              />
            </li>
          ))
        )}
      </ul>
    </nav>
  );
}

/* ------------------------------------------------------------------ */

interface ConversationRowProps {
  title: string;
  preview: string;
  selected: boolean;
  unread: boolean;
  busy?: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
  avatar?: { name: string; photoURL?: string | null };
  /**
   * `label` is the mono-uppercase treatment the rest of the app uses for
   * system text — right for a role descriptor. A message preview is
   * somebody's actual sentence, and setting it in caps mono makes it
   * read as machine output rather than as something a person said.
   */
  previewStyle?: "label" | "text";
}

function ConversationRow({
  title,
  preview,
  selected,
  unread,
  busy = false,
  onClick,
  icon,
  avatar,
  previewStyle = "label",
}: ConversationRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-current={selected ? "page" : undefined}
      className={cn(
        "relative flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-left transition-colors duration-200 disabled:opacity-50",
        /* A left rule rather than a heavier fill: the rail is a column of
           near-identical rows, and an edge marker is findable at a glance
           where a background shade is not. */
        selected
          ? "bg-surface-raised before:absolute before:left-0 before:top-1/2 before:h-5 before:w-[2px] before:-translate-y-1/2 before:rounded-r-full before:bg-ink"
          : "hover:bg-surface-card"
      )}
    >
      {avatar ? (
        <UserAvatar size="sm" name={avatar.name} photoURL={avatar.photoURL} />
      ) : (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-surface-control ring-1 ring-line/[0.06]">
          {icon}
        </span>
      )}

      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block truncate text-[13px] tracking-tight",
            unread ? "font-semibold text-ink-strong" : "font-medium text-ink"
          )}
        >
          {title}
        </span>
        <span
          className={cn(
            "mt-0.5 block truncate",
            previewStyle === "label" || busy
              ? "font-mono text-[9px] uppercase tracking-[0.15em] text-ink-dim"
              : "text-[11px] leading-snug",
            previewStyle === "text" && !busy && (unread ? "text-ink-muted" : "text-ink-dim")
          )}
        >
          {busy ? "Opening…" : preview}
        </span>
      </span>

      {/* One dot, no count. A number here would need a per-thread read of
          the messages nobody has opened, which is the read the
          denormalized trio exists to avoid. */}
      {unread && (
        <span aria-label="Unread" className="h-2 w-2 shrink-0 rounded-full bg-orbit-red" />
      )}
    </button>
  );
}
