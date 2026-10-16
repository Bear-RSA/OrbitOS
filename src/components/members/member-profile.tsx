"use client";

import { useEffect, useMemo, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { CalendarClock, MessageSquare, Network, Phone } from "lucide-react";
import { getOrgChartAction, type ChartPerson, type OrgChart } from "@/app/actions/org-chart";
import { RANK_TEXT } from "@/components/ui/rank-styles";
import { tintStyle } from "@/components/ui/department-glass";
import { tintOf } from "@/lib/members/department-tint";
import { tintsByPerson } from "@/lib/members/chart-layout";
import { WORKLOAD_STATUS } from "@/components/teams/workload-status";
import { standingOf } from "@/lib/members/standing";
import { calculateMemberWorkload } from "@/lib/utils/dashboard-logic";
import { useCall } from "@/contexts/call-context";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { UserAvatar } from "@/components/ui/user-avatar";
import { getTasksByOrg } from "@/lib/queries/tasks";
import { findDirectThread } from "@/lib/queries/messages";
import { getEventsInRange } from "@/lib/queries/events";
import { sharedEngagements, workloadFor } from "@/lib/members/profile";
import { presenceTone, resolvePresence } from "@/lib/members/presence";
import { engagementPresenceByMember } from "@/lib/calendar/presence";
import { cn } from "@/lib/utils/classnames";
import type { Member } from "@/types/member";
import type { OrbitEvent } from "@/types/event";
import type { Task } from "@/types/task";
import type { Conversation } from "@/types/message";
import { RANK_LABEL, roleLabel, rankOf } from "@/lib/members/rank";

/* ------------------------------------------------------------------ */
/*  Member profile                                                     */
/*                                                                     */
/*  One read-only card for "who is this person", opened from anywhere  */
/*  a face or a name appears. `ProfileModal` is the editable view of   */
/*  YOUR OWN account and stays separate — the two answer different     */
/*  questions, and merging them would put a Save button on somebody    */
/*  else's record.                                                     */
/*                                                                     */
/*  It places the call itself rather than raising an `onCall` to four  */
/*  different callers. The ring has to outlive the dialog — a call     */
/*  that hangs up because a card closed is not a call — so the card    */
/*  hands it to the session and closes; see `contexts/call-context`.   */
/*                                                                     */
/*  Everything shown is already readable by any member of the org:     */
/*  the user doc, org-wide `events`, org-wide `tasks`, and the dm the  */
/*  viewer is themselves a participant in. Nothing here widens what    */
/*  one member can see of another.                                     */
/* ------------------------------------------------------------------ */

/** How far back to look for engagements the two people shared. */
const HISTORY_DAYS = 90;

interface MemberProfileProps {
  /** The person to show. `null` closes the card. */
  member: Member | null;
  onClose: () => void;
  viewer: { id: string; orgId: string };
  /** Opens the dm with this person. Omitted when already in it. */
  onMessage?: (uid: string) => void;
  /** Passed when the caller already holds them, to save the read. */
  tasks?: Task[];
  events?: OrbitEvent[];
  /**
   * The dm between the viewer and this person, when the caller already
   * has it in hand.
   *
   * Deliberately a prop rather than a read of its own. A conversation
   * that does not exist yet cannot be read at all — the rule dereferences
   * `resource.data.orgId`, which is null for a missing document, so the
   * get is denied rather than returning empty. Fetching it here would
   * mean a permission error in the console every time somebody opens the
   * card of a colleague they have never messaged, which is the common
   * case and would bury real errors.
   */
  dm?: Conversation | null;
  /**
   * The org chart, when the caller already has it (Teams). Otherwise the
   * card reads it on open: any member may, and it is what the reporting
   * line and departments come from.
   */
  chart?: OrgChart | null;
  /** Project names by id, for the Work section. Teams has them in hand. */
  projectNames?: ReadonlyMap<string, string>;
}

export function MemberProfile({
  member,
  onClose,
  viewer,
  onMessage,
  tasks: providedTasks,
  events: providedEvents,
  dm: providedDm,
  chart: providedChart,
  projectNames,
}: MemberProfileProps) {
  const [tasks, setTasks] = useState<Task[]>(providedTasks ?? []);
  const [events, setEvents] = useState<OrbitEvent[]>(providedEvents ?? []);
  const { callPerson } = useCall();
  const [fetchedChart, setFetchedChart] = useState<OrgChart | null>(null);
  const [fetchedDm, setFetchedDm] = useState<Conversation | null>(null);
  const chart = providedChart ?? fetchedChart;

  const memberId = member?.id ?? null;
  const isSelf = memberId === viewer.id;

  /* Fetched on open, not on mount, and only when the caller did not
     already have them. The dashboard holds both; Messages holds
     neither, and opening one card is not a reason to put two more
     listeners on that page for the whole session. */
  useEffect(() => {
    if (!memberId || providedTasks) return;

    let cancelled = false;
    getTasksByOrg(viewer.orgId)
      .then((rows) => !cancelled && setTasks(rows))
      .catch((err) => console.error("[MemberProfile] Tasks unavailable:", err));

    return () => {
      cancelled = true;
    };
  }, [memberId, providedTasks, viewer.orgId]);

  useEffect(() => {
    if (!memberId || providedEvents) return;

    let cancelled = false;
    const now = new Date();
    const from = new Date(now.getTime() - HISTORY_DAYS * 86_400_000);

    /* Reuses the (orgId, startAt) composite index the calendar already
       relies on — no new index for this card. */
    getEventsInRange(viewer.orgId, from, now)
      .then((rows) => !cancelled && setEvents(rows))
      .catch((err) => console.error("[MemberProfile] Engagements unavailable:", err));

    return () => {
      cancelled = true;
    };
  }, [memberId, providedEvents, viewer.orgId]);

  /* The thread between the two of you, when the caller didn't pass it:
     looked up among threads the viewer is already in, so "No messages
     yet" is only ever said when it's true. */
  useEffect(() => {
    setFetchedDm(null);
    if (!memberId || isSelf || providedDm !== undefined) return;
    let cancelled = false;
    findDirectThread(viewer.id, viewer.orgId, memberId)
      .then((thread) => !cancelled && setFetchedDm(thread))
      .catch((err) => console.error("[MemberProfile] Messages unavailable:", err));
    return () => {
      cancelled = true;
    };
  }, [memberId, isSelf, providedDm, viewer.id, viewer.orgId]);
  const dm = providedDm ?? fetchedDm;

  useEffect(() => {
    if (!memberId || providedChart) return;
    let cancelled = false;
    getOrgChartAction()
      .then((result) => !cancelled && result.success && setFetchedChart(result.chart))
      .catch((err) => console.error("[MemberProfile] Org chart unavailable:", err));
    return () => {
      cancelled = true;
    };
  }, [memberId, providedChart]);

  /* Their department shade, the one their Teams card and Messages row wear. */
  const shade = useMemo(
    () => (memberId && chart ? tintsByPerson(chart).get(memberId) ?? null : null),
    [memberId, chart]
  );

  const standing = useMemo(
    () => (memberId && chart ? standingOf<ChartPerson, OrgChart["departments"][number]>(memberId, chart) : null),
    [memberId, chart]
  );

  const workload = useMemo(
    () => (memberId ? workloadFor(tasks, memberId) : { open: 0, loadPercent: 0 }),
    [tasks, memberId]
  );

  const shared = useMemo(
    () => (memberId ? sharedEngagements(events, viewer.id, memberId) : []),
    [events, viewer.id, memberId]
  );

  /* A live engagement outranks a self-set status, the same bargain the
     Personnel Network makes: somebody who clicked "available" an hour
     ago and is in a client call right now is not available. */
  const presence = useMemo(() => {
    if (!member) return null;
    const map = engagementPresenceByMember(events, [member.id], {
      [member.id]: member.name,
    });
    return map[member.id] ?? null;
  }, [events, member]);

  if (!member) return null;

  /* Health as an individual: the same reading the Teams roster uses. */
  const health = (() => {
    const reading = calculateMemberWorkload(member, tasks);
    return { metrics: reading.metrics, look: WORKLOAD_STATUS[reading.status] };
  })();

  const lastActiveAt = member.lastActivity?.toDate?.();
  const lastActive = lastActiveAt ? formatDistanceToNow(lastActiveAt, { addSuffix: true }) : null;

  // Their next three deadlines, soonest first, overdue included.
  const deadlines = tasks
    .filter((t) => t.status !== "done" && t.assignedTo?.includes(member.id) && t.dueDate?.toDate)
    .sort((a, b) => a.dueDate!.toMillis() - b.dueDate!.toMillis())
    .slice(0, 3);

  // The projects their open work sits in, busiest first.
  const projects = (() => {
    if (!projectNames) return [];
    const open = new Map<string, number>();
    for (const t of tasks) {
      if (t.status === "done" || !t.assignedTo?.includes(member.id)) continue;
      open.set(t.projectId, (open.get(t.projectId) ?? 0) + 1);
    }
    return [...open]
      .map(([id, count]) => ({ name: projectNames.get(id) ?? "", open: count }))
      .filter((p) => p.name)
      .sort((a, b) => b.open - a.open)
      .slice(0, 3);
  })();

  const rank = rankOf(member.role, false);

  /* From the heartbeat, not the stored status — see `lib/members/
     presence`. A live engagement still outranks both. */
  const heartbeat = resolvePresence({
    operationalStatus: member.operationalStatus,
    manualOverride: member.manualOverride,
    lastActivityMs: member.lastActivity?.toMillis?.() ?? null,
  });

  const status = presence ? presence.label : heartbeat;
  const statusTone = presence ? "bg-orbit-amber" : presenceTone(heartbeat);

  const descriptor =
    member.roleDescriptor || roleLabel(member.role);

  /* Calling yourself is the one thing that is not a call, so it is the
     one thing still refused here — and the server refuses it too.

     Everything else is now the caller's judgement rather than this
     component's. Being in a meeting, or reading as offline, does not
     make somebody unreachable: presence is a heartbeat heuristic, and
     `IncomingCall` rings on any client with OrbitOS open regardless of
     what the dot says. The status is still on the card, right above
     this button — that is the honest way to tell somebody what they
     are interrupting. Refusing to place the call was not. */
  const callBlocked = isSelf;
  const callReason = isSelf
    ? "This is you"
    : presence
      ? `${member.name} is ${presence.label} — call anyway`
      : heartbeat === "offline"
        ? `${member.name} looks offline — call anyway`
        : `Call ${member.name}`;

  return (
    <>
      <Dialog open onOpenChange={(next) => !next && onClose()}>
        <DialogContent
          /* Near-solid rather than the dialogs' usual fog: this card is
             read closely, and the tree behind it showed through as blur. */
          className={cn(
            "max-h-[88vh] gap-0 overflow-y-auto rounded-[28px] p-6 [&.material-fog-modal]:[--fog-alpha:0.97] sm:max-w-lg",
            /* The rim in their department's colour, as on their Teams card. */
            shade && "ring-[rgb(var(--tint)/0.22)]"
          )}
          style={shade ? tintStyle(shade) : undefined}
          /* The banner bleeds to the edges by exactly this padding, so the
             desktop layer has to use it too rather than the default 48px. */
          contentClassName="sm:p-6"
          id="member-profile"
        >
          {/* ── Banner ─────────────────────────────────────────── */}
          <div
            className={cn(
              "-mx-6 -mt-6 mb-5 border-b px-6 pb-5 pt-6",
              shade
                ? "border-[rgb(var(--tint)/0.18)] bg-[linear-gradient(180deg,rgb(var(--tint)/0.16)_0%,rgb(var(--tint)/0.06)_100%)]"
                : "border-line/[0.07] bg-surface-hover/60"
            )}
          >
            <div className="flex items-start gap-4">
              <UserAvatar size="xl" name={member.name} photoURL={member.photoURL} uid={member.id} rank={rank} />

              <div className="min-w-0 flex-1 pr-10 pt-1">
                <DialogTitle className="break-words text-[18px] font-medium tracking-tight text-ink-strong">
                  {member.name}
                </DialogTitle>
                <p className={cn("mt-0.5 text-[11px] uppercase tracking-wide", rank === "MEMBER" ? "text-ink-dim" : RANK_TEXT[rank])}>
                  {RANK_LABEL[rank]}
                </p>
                <p className="mt-0.5 break-words text-[12px] text-ink-dim">
                  {descriptor}
                </p>
                <p className="mt-2 flex items-center gap-2 text-[11px] text-ink-muted">
                  <span className={cn("h-1.5 w-1.5 rounded-full", statusTone)} />
                  <span className="capitalize">{status}</span>
                </p>
              </div>
            </div>
          </div>

          {/* ── Actions ────────────────────────────────────────── */}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={callBlocked}
              title={callReason}
              onClick={() => {
                callPerson({
                  uid: member.id,
                  name: member.name,
                  photoURL: member.photoURL,
                });
                onClose();
              }}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-surface-control px-3 py-2.5 text-[12px] text-ink ring-1 ring-inset ring-line/[0.08] transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-30"
            >
              <Phone className="h-3.5 w-3.5" aria-hidden />
              Call
            </button>

            {onMessage && !isSelf && (
              <button
                type="button"
                onClick={() => {
                  onMessage(member.id);
                  onClose();
                }}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-ink px-3 py-2.5 text-[12px] text-on-ink transition-transform duration-300 hover:-translate-y-px"
              >
                <MessageSquare className="h-3.5 w-3.5" aria-hidden />
                Message
              </button>
            )}
          </div>

          {/* ── Bio ────────────────────────────────────────────── */}
          {(member as { bio?: string }).bio && (
            <p className="mt-5 text-[12px] leading-relaxed text-ink-muted">
              {(member as { bio?: string }).bio}
            </p>
          )}

          {/* ── Health ─────────────────────────────────────────── */}
          <Section label="Health">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full bg-surface-control px-2.5 py-1 text-[11px] ring-1 ring-inset ring-line/[0.08]",
                  health.look.text
                )}
              >
                <span className={cn("h-1.5 w-1.5 rounded-full", health.look.dot)} />
                {health.look.label}
              </span>
              {lastActive && <span className="text-[11px] text-ink-dim">Last active {lastActive}</span>}
            </div>

            <div className="mt-3 grid grid-cols-4 gap-2">
              <Metric label="Active" value={health.metrics.activeTasks} />
              <Metric label="Overdue" value={health.metrics.overdueTasks} tone={health.metrics.overdueTasks > 0 ? "red" : undefined} />
              <Metric label="Blocked" value={health.metrics.blockedTasks} tone={health.metrics.blockedTasks > 0 ? "amber" : undefined} />
              <Metric label="Done this week" value={health.metrics.completedThisWeek} tone={health.metrics.completedThisWeek > 0 ? "green" : undefined} />
            </div>

            <div className="mt-3 flex items-center gap-3">
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-line/[0.09]">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-500",
                    workload.loadPercent >= 80 ? "bg-orbit-red" : "bg-ink"
                  )}
                  style={{ width: `${workload.loadPercent}%` }}
                />
              </div>
              <span className="shrink-0 font-mono text-[11px] tabular-nums text-ink-muted">
                {workload.loadPercent}% load
              </span>
            </div>
          </Section>

          {/* ── Place in the company ───────────────────────────── */}
          <Section label="Place in the company">
            {!standing ? (
              <p className="text-[12px] text-ink-dim">Loading the org chart…</p>
            ) : !standing.onChart ? (
              <p className="text-[12px] text-ink-dim">
                Not on the org chart yet. Internal Management places people in Admin Tools.
              </p>
            ) : (
              <>
                {/* One connected line, the way the chart is wired: everyone
                    and every department above them, then them, then who
                    reports to them. */}
                <ol className="relative space-y-1.5 pl-4 before:absolute before:bottom-3 before:left-[5px] before:top-3 before:w-px before:bg-line/[0.14]">
                  {standing.line.map((step) => (
                    <TreeStep key={step.kind === "person" ? step.person.id : `d:${step.department.id}`}>
                      {step.kind === "person" ? (
                        <PersonChip person={step.person} />
                      ) : (
                        <DepartmentChip department={step.department} />
                      )}
                    </TreeStep>
                  ))}

                  <TreeStep here>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-ink/[0.08] py-0.5 pl-0.5 pr-2 ring-1 ring-inset ring-line/[0.14]">
                      <UserAvatar
                        size="sm"
                        name={member.name}
                        photoURL={member.photoURL}
                        rank={rank}
                        className="h-5 w-5 rounded-full [&>div]:rounded-full"
                      />
                      <span className="text-[11px] font-medium text-ink-strong">{member.name}</span>
                    </span>
                  </TreeStep>

                  {standing.reports.map((group) => (
                    <li key={group.department?.id ?? "direct"} className="relative ml-4 space-y-1.5 pl-4 before:absolute before:bottom-3 before:left-[5px] before:top-0 before:w-px before:bg-line/[0.1]">
                      {group.department && (
                        <TreeStep as="div">
                          <DepartmentChip department={group.department} />
                        </TreeStep>
                      )}
                      {group.people.length === 0 ? (
                        <p className="pl-1 text-[11px] text-ink-dim">No one in it yet</p>
                      ) : (
                        <div className={cn("space-y-1.5", group.department && "ml-4")}>
                          {group.people.map((p) => (
                            <TreeStep key={p.id} as="div">
                              <PersonChip person={p} />
                            </TreeStep>
                          ))}
                        </div>
                      )}
                    </li>
                  ))}
                </ol>

                {/* Who they answer to: the nearest person above them on the
                    wires. When nobody sits between them and their
                    department, that is the department's Head. */}
                {member.role !== "OWNER" && (
                  <p className="mt-3 text-[12px] text-ink-muted">
                    {standing.reportsTo[0] ? (
                      <>
                        Reports to <span className="font-medium text-ink">{standing.reportsTo[0].name}</span>
                        {standing.line.at(-1)?.kind === "department" && standing.department && (
                          <span className="text-ink-dim"> · Head of {standing.department.department.name}</span>
                        )}
                      </>
                    ) : standing.department ? (
                      <span className="text-ink-dim">
                        In {standing.department.department.name}, which has no Head yet, so they report to no one
                      </span>
                    ) : (
                      <span className="text-ink-dim">Doesn&apos;t report to anyone yet</span>
                    )}
                  </p>
                )}

                <p className="mt-1.5 text-[11px] text-ink-dim">
                  {standing.directReports.length === 0
                    ? "No one reports to them."
                    : `${standing.directReports.length} report${standing.directReports.length === 1 ? "s" : ""} to them directly`}
                  {standing.teamSize > standing.directReports.length && ` · ${standing.teamSize} under them in all`}
                </p>
              </>
            )}
          </Section>

          {/* ── Work ───────────────────────────────────────────── */}
          {(deadlines.length > 0 || projects.length > 0) && (
            <Section label="Work">
              {deadlines.length > 0 && (
                <ul className="space-y-1.5">
                  {deadlines.map((task) => {
                    const due = task.dueDate!.toDate();
                    const late = due.getTime() < Date.now();
                    return (
                      <li key={task.id} className="flex items-start gap-2.5 text-[12px]">
                        <CalendarClock className="mt-0.5 h-3 w-3 shrink-0 text-ink-faint" aria-hidden />
                        <span className="min-w-0 flex-1 break-words text-ink-muted">
                          {task.title}
                          {projectNames?.get(task.projectId) && (
                            <span className="text-ink-dim"> · {projectNames.get(task.projectId)}</span>
                          )}
                        </span>
                        <span className={cn("shrink-0 text-[11px]", late ? "text-orbit-red" : "text-ink-dim")}>
                          {late ? "Overdue · " : ""}
                          {format(due, "d MMM")}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}

              {projects.length > 0 && (
                <p className={cn("text-[12px] text-ink-muted", deadlines.length > 0 && "mt-3")}>
                  <span className="text-ink-dim">Working across </span>
                  {projects.map((p) => `${p.name} (${p.open})`).join(", ")}
                </p>
              )}
            </Section>
          )}

          {/* ── Shared history ─────────────────────────────────── */}
          {!isSelf && (
            <Section label="Between you">
              {dm?.lastMessagePreview ? (
                <div className="space-y-0.5 text-[12px]">
                  <p className="break-words text-ink-muted">
                    <span className="text-ink-dim">
                      {dm.lastMessageBy === viewer.id ? "You" : member.name}:{" "}
                    </span>
                    {dm.lastMessagePreview}
                  </p>
                  {dm.lastMessageAt?.toDate && (
                    <p className="text-[11px] text-ink-dim">
                      Last message {formatDistanceToNow(dm.lastMessageAt.toDate(), { addSuffix: true })}
                    </p>
                  )}
                </div>
              ) : dm ? (
                <p className="text-[12px] text-ink-dim">You have a thread together, but nothing has been sent yet</p>
              ) : (
                <p className="text-[12px] text-ink-dim">No messages yet</p>
              )}

              {/* Meetings you shared, when there are any. Nothing is said
                  when there aren't: an absence isn't worth a line. */}
              {shared.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {shared.map((event) => (
                    <li key={event.id} className="flex items-center gap-2.5 text-[12px]">
                      <CalendarClock
                        className="h-3 w-3 shrink-0 text-ink-faint"
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1 truncate text-ink-muted">
                        {event.title}
                      </span>
                      <span className="shrink-0 text-[12px] text-ink-dim">
                        {event.startAt?.toDate
                          ? format(event.startAt.toDate(), "d MMM")
                          : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          )}
        </DialogContent>
      </Dialog>

    </>
  );
}

/* ------------------------------------------------------------------ */

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="mt-5 border-t border-line/[0.07] pt-4">
      <h3 className="mb-2.5 text-[12px] text-ink-dim">
        {label}
      </h3>
      {children}
    </section>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone?: "red" | "amber" | "green" }) {
  return (
    <div className="rounded-xl bg-surface-control/60 px-2.5 py-2 ring-1 ring-inset ring-line/[0.06]">
      <p
        className={cn(
          "font-mono text-[16px] tabular-nums",
          tone === "red" ? "text-orbit-red" : tone === "amber" ? "text-orbit-amber" : tone === "green" ? "text-orbit-green" : "text-ink"
        )}
      >
        {value}
      </p>
      <p className="mt-0.5 text-[10px] leading-tight text-ink-dim">{label}</p>
    </div>
  );
}

/** A name with their rank's halo, as it reads on the chart. */
function PersonChip({ person }: { person: ChartPerson }) {
  const rank = rankOf(person.role, false);
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-control py-0.5 pl-0.5 pr-2 ring-1 ring-inset ring-line/[0.06]">
      <UserAvatar size="sm" name={person.name} photoURL={person.photoURL} rank={rank} className="h-5 w-5 rounded-full [&>div]:rounded-full" />
      <span className="text-[11px] text-ink">{person.name}</span>
      {rank !== "MEMBER" && <span className={cn("text-[10px]", RANK_TEXT[rank])}>{RANK_LABEL[rank]}</span>}
    </span>
  );
}

/** One stop on the line: a dot on the rail, then whatever stands there. */
function TreeStep({
  children,
  here = false,
  as: Tag = "li",
}: {
  children: React.ReactNode;
  /** The person this card is about. */
  here?: boolean;
  as?: "li" | "div";
}) {
  return (
    <Tag className="relative flex items-center">
      <span
        aria-hidden
        className={cn(
          "absolute -left-4 top-1/2 h-[7px] w-[7px] -translate-y-1/2 rounded-full ring-2 ring-surface-card",
          here ? "bg-ink-strong" : "bg-ink-faint"
        )}
      />
      {children}
    </Tag>
  );
}

/** A department on the line, in its own colour. */
function DepartmentChip({ department }: { department: OrgChart["departments"][number] }) {
  return (
    <span
      style={tintStyle(tintOf(department))}
      className="inline-flex items-center gap-1.5 rounded-full bg-[rgb(var(--tint)/0.12)] py-0.5 pl-1.5 pr-2 ring-1 ring-inset ring-[rgb(var(--tint)/0.28)]"
    >
      <Network className="h-3 w-3 text-[rgb(var(--tint))]" aria-hidden />
      <span className="text-[11px] text-ink">{department.name}</span>
    </span>
  );
}
