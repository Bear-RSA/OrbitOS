import React from "react";
import {
  Terminal,
  Send,
  Zap,
  Upload,
  Trash2,
  UserPlus,
  UserMinus,
  Radio,
  Pencil,
  Ban,
  StickyNote,
  CheckCircle2,
  Archive,
  ArchiveRestore,
  Type,
  Scale,
  ArrowRightLeft,
  MessageSquare,
  CalendarPlus,
  CalendarClock,
  CalendarX2,
  CalendarCheck,
  PhoneCall,
  type LucideIcon,
} from "lucide-react";
import type { ActivityEventType } from "@/types/activity";
import { SIGNAL } from "@/lib/utils/signal-colors";

/* ------------------------------------------------------------------ */
/*  Telemetry Event Registry                                           */
/*                                                                     */
/*  ONE definition per event type: badge, icon, tone and sentence.     */
/*                                                                     */
/*  This used to live in three places — the ActivityEventType union,   */
/*  the CommandCenter EVENT_CONFIG map, and the formatter switch —     */
/*  which drifted apart. Events with no config rendered as a green SYS */
/*  badge; events with no formatter case rendered as the placeholder   */
/*  "executed system operation". The Record<ActivityEventType, …>      */
/*  below makes that a compile error instead of a silent downgrade:    */
/*  adding a type to the union without describing it will not build.   */
/* ------------------------------------------------------------------ */

/**
 * Severity classes. `tone` drives the badge colour AND the filter chips —
 * the feed filters by what an event means rather than by its raw type, so
 * a reader can ask "what went wrong?" without knowing any type names.
 */
export type EventTone = "critical" | "warning" | "success" | "info" | "neutral";

export const TONE_COLOR: Record<EventTone, string> = {
  critical: SIGNAL.red,
  warning: SIGNAL.amber,
  success: SIGNAL.green,
  info: SIGNAL.blue,
  neutral: SIGNAL.ink,
};

export const TONE_LABEL: Record<EventTone, string> = {
  critical: "Critical",
  warning: "Warning",
  success: "Success",
  info: "Activity",
  neutral: "System",
};

export const TONE_ORDER: EventTone[] = [
  "critical",
  "warning",
  "success",
  "info",
  "neutral",
];

export interface EventDescriptor {
  /** Short badge shown in the log gutter. */
  label: string;
  icon: LucideIcon;
  tone: EventTone;
  /** Human sentence, minus the actor — the actor is rendered by the row. */
  describe: (m: Record<string, any>) => React.ReactNode;
}

/* ------------------------------------------------------------------ */
/*  Sentence fragments                                                 */
/* ------------------------------------------------------------------ */

/**
 * The subject of an event — a file name, a task title, a member. Amber and
 * lightly haloed so the eye can scan a column of sentences for the noun
 * without having to read any of them.
 */
function Target({ val }: { val?: string }) {
  return (
    <span
      className="font-semibold text-orbit-amber mx-1"
      style={{ textShadow: "0 0 10px rgba(229, 181, 103, 0.35)" }}
    >
      {val || "untitled"}
    </span>
  );
}

/** A secondary value — a status name, a field name. Quieter than Target. */
function Detail({ val, tone }: { val?: string; tone?: EventTone }) {
  return (
    <span className="font-medium mx-1" style={{ color: tone ? TONE_COLOR[tone] : SIGNAL.ink }}>
      {val || "unknown"}
    </span>
  );
}

/** Best available name for a directive across old and new metadata shapes. */
const task = (m: Record<string, any>) => m.taskTitle || m.title || m.directiveId;

/** Best available name for an engagement. */
const engagement = (m: Record<string, any>) => m.eventTitle || m.title || m.eventId;

/** RSVP values read as answers in a sentence, not as enum members. */
const RSVP_WORD: Record<string, string> = {
  accepted: "yes",
  declined: "no",
  tentative: "maybe",
  pending: "no answer yet",
};

const RSVP_TONE: Record<string, EventTone> = {
  accepted: "success",
  declined: "critical",
  tentative: "warning",
  pending: "neutral",
};

/* ------------------------------------------------------------------ */
/*  The registry                                                       */
/* ------------------------------------------------------------------ */

export const EVENT_REGISTRY: Record<ActivityEventType, EventDescriptor> = {
  SYSTEM_BOOT: {
    label: "SYS",
    icon: Terminal,
    tone: "neutral",
    describe: () => <>brought the workspace online</>,
  },

  /* ---- Directives ---- */
  DIRECTIVE_CREATED: {
    label: "NEW",
    icon: Zap,
    tone: "info",
    describe: (m) => (
      <>
        opened directive <Target val={task(m)} />
      </>
    ),
  },
  DIRECTIVE_TRANSITION: {
    label: "MOV",
    icon: ArrowRightLeft,
    tone: "info",
    describe: (m) => (
      <>
        moved <Target val={task(m)} />
        {m.from ? (
          <>
            from <Detail val={m.from} />
          </>
        ) : null}
        to <Detail val={m.to} />
      </>
    ),
  },
  DIRECTIVE_EDITED: {
    label: "EDT",
    icon: Pencil,
    tone: "neutral",
    describe: (m) => (
      <>
        revised{" "}
        {m.field ? (
          <>
            <Detail val={m.field} /> on
          </>
        ) : null}
        <Target val={task(m)} />
      </>
    ),
  },
  DIRECTIVE_ASSIGNED: {
    label: "ASN",
    icon: UserPlus,
    tone: "warning",
    describe: (m) => (
      <>
        assigned <Target val={task(m)} /> to
        <Detail val={m.assigneeName || m.memberName || m.assignee} />
      </>
    ),
  },
  DIRECTIVE_BLOCKED: {
    label: "BLK",
    icon: Ban,
    tone: "critical",
    describe: (m) => (
      <>
        flagged <Target val={task(m)} /> as <Detail val="blocked" tone="critical" />
        {m.reason ? <span className="text-ink-dim"> — {m.reason}</span> : null}
      </>
    ),
  },
  DIRECTIVE_UNBLOCKED: {
    label: "CLR",
    icon: Radio,
    tone: "success",
    describe: (m) => (
      <>
        cleared the block on <Target val={task(m)} />
      </>
    ),
  },
  DIRECTIVE_DELETED: {
    label: "DEL",
    icon: Trash2,
    tone: "critical",
    describe: (m) => (
      <>
        deleted directive <Target val={task(m)} />
      </>
    ),
  },
  NOTE_ADDED: {
    label: "NTE",
    icon: StickyNote,
    tone: "info",
    describe: (m) => (
      <>
        left a note on <Target val={task(m)} />
      </>
    ),
  },
  MILESTONE_COMPLETE: {
    label: "DONE",
    icon: CheckCircle2,
    tone: "success",
    describe: (m) => (
      <>
        completed <Target val={m.milestone || task(m)} />
      </>
    ),
  },
  STATUS_TRANSITION: {
    label: "STA",
    icon: Radio,
    tone: "info",
    describe: (m) => (
      <>
        set <Target val={task(m) || m.projectName} /> to <Detail val={m.to || m.status} />
      </>
    ),
  },
  WORKLOAD_SHIFT: {
    label: "LOD",
    icon: Scale,
    tone: "warning",
    describe: (m) => (
      <>
        rebalanced workload for <Target val={m.memberName} />
        {typeof m.delta === "number" ? (
          <Detail val={`${m.delta > 0 ? "+" : ""}${m.delta}`} />
        ) : null}
      </>
    ),
  },

  /* ---- Engagements ---- */
  ENGAGEMENT_SCHEDULED: {
    label: "MTG",
    icon: CalendarPlus,
    tone: "info",
    describe: (m) => (
      <>
        scheduled <Target val={engagement(m)} />
        {typeof m.attendeeCount === "number" ? (
          <>
            with <Detail val={`${m.attendeeCount} attending`} />
          </>
        ) : null}
      </>
    ),
  },
  ENGAGEMENT_REVISED: {
    label: "MTG",
    icon: CalendarClock,
    tone: "neutral",
    describe: (m) => (
      <>
        {m.rescheduled ? "moved" : "revised"} <Target val={engagement(m)} />
      </>
    ),
  },
  ENGAGEMENT_CANCELLED: {
    label: "MTG",
    icon: CalendarX2,
    tone: "warning",
    describe: (m) => (
      <>
        cancelled <Target val={engagement(m)} />
      </>
    ),
  },
  RSVP_RECORDED: {
    label: "RSV",
    icon: CalendarCheck,
    tone: "info",
    describe: (m) => (
      <>
        replied <Detail val={RSVP_WORD[m.rsvp as string] ?? m.rsvp} tone={RSVP_TONE[m.rsvp as string]} />
        to <Target val={engagement(m)} />
      </>
    ),
  },

  /* A direct call leaves no calendar entry, so this line is the only
     record that two operatives spoke. Who answered is not logged —
     that is between them. */
  CALL_STARTED: {
    label: "CAL",
    icon: PhoneCall,
    tone: "info",
    describe: (m) => (
      <>
        called <Target val={(m.toName as string) || "an operative"} />
      </>
    ),
  },

  /* ---- Assets ---- */
  ASSET_INGESTED: {
    label: "AST",
    icon: Upload,
    tone: "info",
    describe: (m) => (
      <>
        uploaded <Target val={m.fileName} />
      </>
    ),
  },
  ASSET_DESTROYED: {
    label: "PRG",
    icon: Trash2,
    tone: "critical",
    describe: (m) => (
      <>
        deleted <Target val={m.fileName} />
      </>
    ),
  },

  /* ---- People ---- */
  INVITE_DISPATCHED: {
    label: "INV",
    icon: Send,
    tone: "info",
    describe: (m) => (
      <>
        invited <Target val={m.email || m.memberName} />
        {m.role ? (
          <>
            as <Detail val={m.role} />
          </>
        ) : null}
      </>
    ),
  },
  MEMBER_REMOVED: {
    label: "RVK",
    icon: UserMinus,
    tone: "critical",
    describe: (m) => (
      <>
        removed <Target val={m.memberName || m.email} /> from the workspace
      </>
    ),
  },
  BRIEFING_POSTED: {
    label: "MSG",
    icon: MessageSquare,
    tone: "neutral",
    describe: (m) =>
      m.excerpt ? (
        <>
          posted a briefing — <span className="text-ink">&ldquo;{m.excerpt}&rdquo;</span>
        </>
      ) : (
        <>posted a briefing</>
      ),
  },

  /* ---- Project lifecycle ---- */
  PROJECT_RENAMED: {
    label: "REN",
    icon: Type,
    tone: "neutral",
    describe: (m) => (
      <>
        renamed the project
        {m.from ? (
          <>
            from <Detail val={m.from} />
          </>
        ) : null}
        to <Target val={m.to || m.projectName} />
      </>
    ),
  },
  PROJECT_DESCRIPTION_UPDATED: {
    label: "DSC",
    icon: Pencil,
    tone: "neutral",
    describe: () => <>updated the project description</>,
  },
  PROJECT_ARCHIVED: {
    label: "ARC",
    icon: Archive,
    tone: "warning",
    describe: (m) => (
      <>
        archived <Target val={m.projectName} />
      </>
    ),
  },
  PROJECT_RESTORED: {
    label: "RST",
    icon: ArchiveRestore,
    tone: "success",
    describe: (m) => (
      <>
        restored <Target val={m.projectName} /> from the archive
      </>
    ),
  },
  PROJECT_TERMINATED: {
    label: "END",
    icon: Trash2,
    tone: "critical",
    describe: (m) => (
      <>
        terminated <Target val={m.projectName} />
      </>
    ),
  },
};

/* ------------------------------------------------------------------ */
/*  Legacy aliases                                                     */
/*                                                                     */
/*  Event names written by older builds and still sitting in Firestore. */
/*  Mapping them here rather than re-adding them to the union keeps the */
/*  union as the list of names we are willing to WRITE, while the log   */
/*  stays readable all the way back through history.                    */
/* ------------------------------------------------------------------ */

const LEGACY_ALIASES: Record<string, ActivityEventType> = {
  ASSET_DELETED: "ASSET_DESTROYED",
  MILESTONE_EXECUTED: "MILESTONE_COMPLETE",
  MILESTONE_CREATED: "DIRECTIVE_CREATED",
  DIRECTIVE_UPDATED: "DIRECTIVE_EDITED",
  MEMBER_ADDED: "INVITE_DISPATCHED",
};

/**
 * Resolves any event type — current, legacy or unrecognised — to a
 * descriptor. An unknown type degrades to a readable, honest row instead of
 * masquerading as a system boot.
 */
export function describeEvent(eventType: string): EventDescriptor {
  const canonical = LEGACY_ALIASES[eventType] ?? eventType;
  const known = EVENT_REGISTRY[canonical as ActivityEventType];
  if (known) return known;

  return {
    label: "UNK",
    icon: Terminal,
    tone: "neutral",
    // Show the raw type. An unmapped event is a gap in this registry, and
    // naming it in the UI is what makes that gap findable.
    describe: () => (
      <>
        recorded{" "}
        <span className="text-ink-dim">{eventType.toLowerCase().replace(/_/g, " ")}</span>
      </>
    ),
  };
}
