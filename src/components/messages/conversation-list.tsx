"use client";

import { useMemo, useState } from "react";
import { Megaphone, Plus, Search, Users, X } from "lucide-react";
import { conversationTitle, conversationUnread } from "@/lib/messages/summary";
import { UserAvatar } from "@/components/ui/user-avatar";
import { cn } from "@/lib/utils/classnames";
import { TOWN_HALL_NAME, type Conversation } from "@/types/message";
import type { Member } from "@/types/member";

/* ------------------------------------------------------------------ */
/*  Conversation list                                                  */
/*                                                                     */
/*  The left rail, in two tabs and three sections.                     */
/*                                                                     */
/*  The sections are the design. One undifferentiated column of rows   */
/*  is what made this read as a list of records rather than a place    */
/*  you talk to people — Town Hall, a colleague, and a project group   */
/*  are three different kinds of thing, and the rail now says so       */
/*  before the reader has to work it out from the icons.               */
/*                                                                     */
/*  PEOPLE is the live org directory, the same `subscribeToMembers-    */
/*  ByOrg` the dashboard and the Personnel Network use.                */
/*                                                                     */
/*  It renders and reports clicks. Selection, tab, and the dm/group    */
/*  round trips all live on the page, so this component holds no state */
/*  that could disagree with what the thread pane is showing — the     */
/*  search box is the one exception, and it is nobody else's business. */
/* ------------------------------------------------------------------ */

export type ConversationTab = "chats" | "people";

interface ConversationListProps {
  viewerUid: string;
  /** The org directory, for resolving dm titles, faces and presence. */
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
  /** A row in People starts the conversation — that is what People is for. */
  onOpenDm: (uid: string) => void;
  /** The picture, and only the picture, opens the person. */
  onOpenProfile: (uid: string) => void;
  onCreateGroup: () => void;
}

/** Presence as a colour, matching the Personnel Network's vocabulary. */
function presenceTone(member?: Member): string | null {
  if (!member) return null;
  switch (member.operationalStatus) {
    case "offline":
      return "bg-ink-faint";
    case "focused":
      return "bg-orbit-amber";
    default:
      return "bg-orbit-green";
  }
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
  onOpenProfile,
  onCreateGroup,
}: ConversationListProps) {
  const [search, setSearch] = useState("");

  const liveNames = useMemo(
    () => Object.fromEntries(members.map((m) => [m.id, m.name])),
    [members]
  );

  const directory = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  const needle = search.trim().toLowerCase();

  /* Titles are resolved once here rather than twice — for the filter and
     again for the row. */
  const titled = useMemo(
    () =>
      threads.map((conversation) => ({
        conversation,
        title: conversationTitle(conversation, viewerUid, liveNames),
      })),
    [threads, viewerUid, liveNames]
  );

  const visible = needle
    ? titled.filter((t) => t.title.toLowerCase().includes(needle))
    : titled;

  const dms = visible.filter((t) => t.conversation.type === "dm");
  const groups = visible.filter((t) => t.conversation.type === "group");

  const townHallVisible =
    !needle || TOWN_HALL_NAME.toLowerCase().includes(needle);

  const visiblePeople = needle
    ? people.filter((m) => m.name.toLowerCase().includes(needle))
    : people;

  const nothingFound =
    tab === "chats"
      ? !townHallVisible && dms.length === 0 && groups.length === 0
      : visiblePeople.length === 0;

  return (
    <nav
      aria-label="Conversations"
      className="hidden w-[17.5rem] shrink-0 flex-col overflow-hidden rounded-2xl border border-line/[0.05] bg-surface-sunken/60 shadow-card sm:flex"
    >
      {/* ── Tabs ───────────────────────────────────────────────── */}
      <div
        role="tablist"
        aria-label="Conversations and people"
        className="flex shrink-0 gap-1 p-2"
      >
        {(["chats", "people"] as ConversationTab[]).map((name) => (
          <button
            key={name}
            role="tab"
            aria-selected={tab === name}
            onClick={() => onTabChange(name)}
            className={cn(
              "flex-1 rounded-lg py-2 font-mono text-[10px] uppercase tracking-[0.2em] transition-all duration-200",
              tab === name
                ? "bg-surface-control text-ink shadow-card ring-1 ring-line/[0.06]"
                : "text-ink-dim hover:bg-surface-card hover:text-ink-muted"
            )}
          >
            {name}
          </button>
        ))}
      </div>

      {/* ── Search ─────────────────────────────────────────────── */}
      <div className="shrink-0 px-2 pb-2">
        <div className="flex items-center gap-2 rounded-lg bg-surface-card px-2.5 py-2 ring-1 ring-inset ring-line/[0.05] transition-shadow focus-within:ring-line/[0.14]">
          <Search className="h-3 w-3 shrink-0 text-ink-faint" aria-hidden />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tab === "chats" ? "Search chats" : "Search people"}
            aria-label={tab === "chats" ? "Search chats" : "Search people"}
            className="min-w-0 flex-1 bg-transparent text-[12px] text-ink placeholder:text-ink-faint focus-visible:outline-none"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Clear search"
              className="shrink-0 text-ink-faint transition-colors hover:text-ink"
            >
              <X className="h-3 w-3" aria-hidden />
            </button>
          )}
        </div>
      </div>

      {/* ── List ───────────────────────────────────────────────── */}
      <div className="custom-scrollbar flex-1 overflow-y-auto px-2 pb-2">
        {nothingFound && (
          <p className="px-2.5 py-10 text-center text-[12px] text-ink-dim">
            {needle ? `Nothing matching “${search.trim()}”` : "Nobody else here yet"}
          </p>
        )}

        {tab === "chats" ? (
          <>
            {townHallVisible && townHall !== undefined && (
              <Section label="Pinned">
                {/* Always present — Town Hall is the one thread nobody
                    joins or leaves. */}
                <ConversationRow
                  title={TOWN_HALL_NAME}
                  preview={
                    townHall?.lastMessagePreview ?? `${members.length} in the workspace`
                  }
                  previewStyle={townHall?.lastMessagePreview ? "text" : "label"}
                  selected={selectedId === townHallId}
                  unread={townHall ? conversationUnread(townHall, viewerUid) : false}
                  onClick={() => townHallId && onSelect(townHallId)}
                  icon={<Megaphone className="h-3.5 w-3.5 text-ink-muted" aria-hidden />}
                />
              </Section>
            )}

            {dms.length > 0 && (
              <Section label="Direct">
                {dms.map(({ conversation, title }) => {
                  const partnerUid = conversation.participantIds?.find(
                    (id) => id !== viewerUid
                  );
                  const partner = partnerUid ? directory.get(partnerUid) : undefined;

                  return (
                    <ConversationRow
                      key={conversation.id}
                      title={title}
                      preview={conversation.lastMessagePreview ?? "No messages yet"}
                      previewStyle={
                        conversation.lastMessagePreview ? "text" : "label"
                      }
                      selected={selectedId === conversation.id}
                      unread={conversationUnread(conversation, viewerUid)}
                      onClick={() => onSelect(conversation.id)}
                      avatar={{ name: title, photoURL: partner?.photoURL }}
                      presence={presenceTone(partner)}
                      onAvatarClick={
                        partnerUid ? () => onOpenProfile(partnerUid) : undefined
                      }
                    />
                  );
                })}
              </Section>
            )}

            {groups.length > 0 && (
              <Section label="Groups">
                {groups.map(({ conversation, title }) => (
                  <ConversationRow
                    key={conversation.id}
                    title={title}
                    preview={conversation.lastMessagePreview ?? "No messages yet"}
                    previewStyle={conversation.lastMessagePreview ? "text" : "label"}
                    selected={selectedId === conversation.id}
                    unread={conversationUnread(conversation, viewerUid)}
                    onClick={() => onSelect(conversation.id)}
                    icon={<Users className="h-3.5 w-3.5 text-ink-muted" aria-hidden />}
                  />
                ))}
              </Section>
            )}
          </>
        ) : (
          visiblePeople.length > 0 && (
            <Section label={`${visiblePeople.length} in the workspace`}>
              {visiblePeople.map((member) => (
                <ConversationRow
                  key={member.id}
                  title={member.name}
                  preview={
                    member.roleDescriptor ||
                    (member.role === "OWNER" ? "Owner" : "Member")
                  }
                  selected={false}
                  unread={false}
                  busy={opening === member.id}
                  onClick={() => onOpenDm(member.id)}
                  onAvatarClick={() => onOpenProfile(member.id)}
                  avatar={{ name: member.name, photoURL: member.photoURL }}
                  presence={presenceTone(member)}
                />
              ))}
            </Section>
          )
        )}
      </div>

      {/* ── New group ──────────────────────────────────────────── */}
      {tab === "chats" && (
        <div className="shrink-0 border-t border-line/[0.05] p-2">
          {/* No approval and no role check — any member may start a
              group, the same way any member may ring a colleague. */}
          <button
            type="button"
            onClick={onCreateGroup}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-surface-control py-2.5 font-mono text-[9px] uppercase tracking-[0.15em] text-ink-muted ring-1 ring-inset ring-line/[0.06] transition-colors hover:bg-surface-hover hover:text-ink"
          >
            <Plus className="h-3 w-3" aria-hidden />
            New group
          </button>
        </div>
      )}
    </nav>
  );
}

/* ------------------------------------------------------------------ */

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="mb-1 mt-2 first:mt-0">
      <h3 className="px-2.5 pb-1.5 font-mono text-[9px] uppercase tracking-[0.22em] text-ink-faint">
        {label}
      </h3>
      <ul className="flex flex-col gap-0.5">{children}</ul>
    </section>
  );
}

interface ConversationRowProps {
  title: string;
  preview: string;
  selected: boolean;
  unread: boolean;
  busy?: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
  avatar?: { name: string; photoURL?: string | null };
  /** Tailwind background class for the presence dot, or null for none. */
  presence?: string | null;
  /**
   * `label` is the mono-uppercase treatment the rest of the app uses for
   * system text — right for a role descriptor. A message preview is
   * somebody's actual sentence, and setting it in caps mono makes it
   * read as machine output rather than as something a person said.
   */
  previewStyle?: "label" | "text";
  /**
   * Opens the person, from the picture alone.
   *
   * The row itself keeps its own job — start the conversation. The face
   * is the only part that means "who is this", so it is the only part
   * that answers it.
   */
  onAvatarClick?: () => void;
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
  presence,
  previewStyle = "label",
  onAvatarClick,
}: ConversationRowProps) {
  const face = (
    <span className="relative block">
      {avatar ? (
        <UserAvatar size="sm" name={avatar.name} photoURL={avatar.photoURL} />
      ) : (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-surface-control ring-1 ring-line/[0.06]">
          {icon}
        </span>
      )}
      {presence && (
        <span
          className={cn(
            "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-surface-sunken",
            presence
          )}
        />
      )}
    </span>
  );

  return (
    /* A li holding two buttons rather than one button — a control inside
       a control is invalid, and the picture and the row do different
       things. */
    <li
      className={cn(
        "relative flex items-center gap-3 rounded-xl px-2.5 py-2.5 transition-all duration-200",
        busy && "opacity-50",
        selected
          ? "bg-surface-control shadow-card ring-1 ring-inset ring-line/[0.08]"
          : "hover:bg-surface-card"
      )}
    >
      {onAvatarClick ? (
        <button
          type="button"
          onClick={onAvatarClick}
          disabled={busy}
          title={`View ${title}`}
          aria-label={`View ${title}`}
          className="shrink-0 rounded-xl transition-transform duration-200 hover:-translate-y-[2px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          {face}
        </button>
      ) : (
        face
      )}

      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        aria-current={selected ? "page" : undefined}
        className="min-w-0 flex-1 text-left focus-visible:outline-none"
      >
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
      </button>

      {/* One dot, no count. A number here would need a per-thread read of
          the messages nobody has opened, which is the read the
          denormalized trio exists to avoid. */}
      {unread && (
        <span aria-label="Unread" className="h-2 w-2 shrink-0 rounded-full bg-orbit-red" />
      )}
    </li>
  );
}
