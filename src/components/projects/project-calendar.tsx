"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
  subWeeks,
} from "date-fns";
import {
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  Inbox,
  Plus,
  MapPin,
  Video,
  X,
  CalendarDays,
  Columns3,
} from "lucide-react";
import { Task } from "@/types/task";
import { Member } from "@/types/member";
import { OrbitEvent, RsvpStatus } from "@/types/event";
import { updateTaskAction } from "@/app/actions/tasks";
import { cancelEventAction, setRsvpAction } from "@/app/actions/events";
import { dueDateKeyOf, parseDateKey, toDateKey } from "@/lib/utils/dates";
import { dayWindowFor, layoutCollisions, LayoutInput } from "@/lib/utils/event-layout";
import { CreateEventDialog } from "@/components/events/create-event-dialog";
import { cn } from "@/lib/utils/classnames";

/* ------------------------------------------------------------------ */
/*  Directive Calendar                                                 */
/*                                                                     */
/*  Two lanes, because the data model has two shapes.                  */
/*                                                                     */
/*  The DATE lane stacks whole-day items in reading order: directives, */
/*  which own a day and nothing finer, and all-day engagements.        */
/*  The INSTANT lane positions timed engagements by offset and         */
/*  resolves overlap horizontally. Month view shows the date lane      */
/*  alone — there is no honest way to draw an instant in a month cell. */
/*                                                                     */
/*  Placement reads `dueDateKey` / `startDateKey`, never a Timestamp:  */
/*  deriving a day from an instant drifts the grid by a timezone.      */
/*                                                                     */
/*  Rescheduling runs on pointer events rather than HTML5 drag-and-    */
/*  drop. This panel sets `backdrop-filter`, which makes it the        */
/*  containing block for positioned descendants and is exactly the     */
/*  kind of ancestor that leaves native dragging inert.                */
/* ------------------------------------------------------------------ */

/** Pointer travel, in px, before a press stops being a click. */
const DRAG_THRESHOLD = 4;
/** Vertical scale of the instant lane. */
const PX_PER_HOUR = 48;

type CalendarView = "month" | "week";

interface ProjectCalendarProps {
  tasks: Task[];
  events: OrbitEvent[];
  members: Member[];
  /** Current operative — authorizes reschedules and RSVPs. */
  uid: string;
  /** null schedules an org-wide engagement. */
  projectId: string | null;
}

interface DragState {
  taskId: string;
  title: string;
  pointerId: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  /** True once travel passes the threshold. Until then it is still a click. */
  moved: boolean;
}

const RSVP_LABEL: Record<RsvpStatus, string> = {
  accepted: "Going",
  declined: "Not going",
  tentative: "Maybe",
  pending: "No answer",
};

/** Scrolls to the task's row in the table below and flashes it. Mirrors
 *  the roadmap's behaviour so both viewers feel like the same control. */
function revealTask(taskId: string) {
  const target = document.getElementById(`task-${taskId}`);
  if (!target) return;
  target.scrollIntoView({ behavior: "smooth", block: "center" });
  target.classList.add("ring-1", "ring-white/30", "transition-all", "duration-500");
  setTimeout(() => target.classList.remove("ring-1", "ring-white/30"), 1500);
}

/** The day cell under the pointer, found by hit-testing the document.
 *  The drag ghost is `pointer-events-none` so it never shadows a cell. */
function dateKeyAtPoint(x: number, y: number): string | null {
  const el = document.elementFromPoint(x, y);
  const cell = el?.closest<HTMLElement>("[data-date-key]");
  return cell?.dataset.dateKey ?? null;
}

export function ProjectCalendar({
  tasks,
  events,
  members,
  uid,
  projectId,
}: ProjectCalendarProps) {
  const [cursor, setCursor] = useState(() => new Date());
  const [view, setView] = useState<CalendarView>("month");
  const [drag, setDrag] = useState<DragState | null>(null);
  const [dropTargetKey, setDropTargetKey] = useState<string | null>(null);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [overdueOpen, setOverdueOpen] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createDateKey, setCreateDateKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /* Pointer handlers fire faster than React commits, so the authoritative
     drag state lives in a ref; `drag` exists only to render the ghost. */
  const dragRef = useRef<DragState | null>(null);

  const todayKey = toDateKey(new Date());

  /* ---------------- Directives ---------------- */

  /* Date keys sort lexicographically, so "before today" is a string
     comparison — no Date arithmetic and no timezone in the path. */
  const { byDay, overdue, unscheduled } = useMemo(() => {
    const byDay = new Map<string, Task[]>();
    const overdue: Task[] = [];
    const unscheduled: Task[] = [];

    for (const task of tasks) {
      const key = dueDateKeyOf(task);
      if (!key) {
        if (task.status !== "done") unscheduled.push(task);
        continue;
      }
      const bucket = byDay.get(key);
      if (bucket) bucket.push(task);
      else byDay.set(key, [task]);

      if (key < todayKey && task.status !== "done") overdue.push(task);
    }

    for (const bucket of byDay.values()) {
      bucket.sort((a, b) => {
        if ((a.status === "done") !== (b.status === "done")) {
          return a.status === "done" ? 1 : -1;
        }
        return a.title.localeCompare(b.title);
      });
    }

    return { byDay, overdue, unscheduled };
  }, [tasks, todayKey]);

  /* ---------------- Engagements ---------------- */

  const { allDayByDay, timedByDay } = useMemo(() => {
    const allDayByDay = new Map<string, OrbitEvent[]>();
    const timedByDay = new Map<string, OrbitEvent[]>();

    for (const event of events) {
      const key = event.startDateKey || toDateKey(event.startAt.toDate());
      const target = event.allDay ? allDayByDay : timedByDay;
      const bucket = target.get(key);
      if (bucket) bucket.push(event);
      else target.set(key, [event]);
    }

    for (const bucket of timedByDay.values()) {
      bucket.sort((a, b) => a.startAt.toMillis() - b.startAt.toMillis());
    }

    return { allDayByDay, timedByDay };
  }, [events]);

  const selectedEvent = useMemo(
    () => events.find((e) => e.id === selectedEventId) ?? null,
    [events, selectedEventId]
  );

  /* ---------------- Visible range ---------------- */

  const monthDays = useMemo(
    () =>
      eachDayOfInterval({
        start: startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 }),
        end: endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 }),
      }),
    [cursor]
  );

  const weekDays = useMemo(
    () =>
      eachDayOfInterval({
        start: startOfWeek(cursor, { weekStartsOn: 1 }),
        end: endOfWeek(cursor, { weekStartsOn: 1 }),
      }),
    [cursor]
  );

  /** Hour range for the instant lane, widened to fit the week's outliers. */
  const window = useMemo(() => {
    const inWeek: LayoutInput[] = [];
    for (const day of weekDays) {
      for (const event of timedByDay.get(toDateKey(day)) ?? []) {
        inWeek.push({
          id: event.id,
          startMs: event.startAt.toMillis(),
          endMs: event.endAt.toMillis(),
        });
      }
    }
    return dayWindowFor(inWeek);
  }, [weekDays, timedByDay]);

  const laneHeight = (window.endHour - window.startHour) * PX_PER_HOUR;

  /* ---------------- Mutations ---------------- */

  const reschedule = useCallback(
    async (taskId: string, dateKey: string | null) => {
      setPending((prev) => new Set(prev).add(taskId));
      try {
        const result = await updateTaskAction({ taskId, uid, updates: { dueDate: dateKey } });
        if (!result.success) console.error("[Calendar] Reschedule rejected:", result.error);
      } finally {
        setPending((prev) => {
          const next = new Set(prev);
          next.delete(taskId);
          return next;
        });
      }
    },
    [uid]
  );

  const respond = useCallback(
    async (eventId: string, status: RsvpStatus) => {
      setBusy(true);
      try {
        const result = await setRsvpAction(uid, eventId, status);
        if (!result.success) console.error("[Calendar] RSVP rejected:", result.error);
      } finally {
        setBusy(false);
      }
    },
    [uid]
  );

  const cancelEngagement = useCallback(
    async (eventId: string) => {
      setBusy(true);
      try {
        const result = await cancelEventAction(uid, eventId);
        if (!result.success) console.error("[Calendar] Cancel rejected:", result.error);
        else setSelectedEventId(null);
      } finally {
        setBusy(false);
      }
    },
    [uid]
  );

  const endDrag = useCallback(() => {
    dragRef.current = null;
    setDrag(null);
    setDropTargetKey(null);
  }, []);

  /**
   * Shared chip wiring.
   *
   * Chips are <div role="button"> rather than <button>: a press has to
   * stay ambiguous until the pointer either travels (a drag) or lifts in
   * place (a click), and a real button commits to the click too early.
   */
  const chipProps = useCallback(
    (task: Task) => ({
      role: "button" as const,
      tabIndex: 0,

      onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
        if (e.button !== 0 || pending.has(task.id)) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        const next: DragState = {
          taskId: task.id,
          title: task.title,
          pointerId: e.pointerId,
          startX: e.clientX,
          startY: e.clientY,
          x: e.clientX,
          y: e.clientY,
          moved: false,
        };
        dragRef.current = next;
        setDrag(next);
      },

      onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
        const current = dragRef.current;
        if (!current || current.pointerId !== e.pointerId) return;

        const moved =
          current.moved ||
          Math.hypot(e.clientX - current.startX, e.clientY - current.startY) > DRAG_THRESHOLD;

        const next = { ...current, x: e.clientX, y: e.clientY, moved };
        dragRef.current = next;
        setDrag(next);

        if (moved) setDropTargetKey(dateKeyAtPoint(e.clientX, e.clientY));
      },

      onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => {
        const current = dragRef.current;
        endDrag();
        if (!current || current.pointerId !== e.pointerId) return;

        // Lifted without travelling — that was a click, not a drag.
        if (!current.moved) {
          revealTask(current.taskId);
          return;
        }

        const key = dateKeyAtPoint(e.clientX, e.clientY);
        if (!key) return; // released outside the grid
        const dragged = tasks.find((t) => t.id === current.taskId);
        if (!dragged || dueDateKeyOf(dragged) === key) return; // no-op drop
        void reschedule(current.taskId, key);
      },

      onPointerCancel: endDrag,

      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        revealTask(task.id);
      },
    }),
    [pending, tasks, reschedule, endDrag]
  );

  /* ---------------- Renderers ---------------- */

  const renderTaskChip = (task: Task, dayKey: string) => {
    const isDone = task.status === "done";
    const isLate = !isDone && dayKey < todayKey;
    const isDueToday = !isDone && dayKey === todayKey;
    const isPending = pending.has(task.id);
    const isBeingDragged = drag?.moved && drag.taskId === task.id;

    return (
      <div
        key={task.id}
        {...chipProps(task)}
        title={task.title}
        className={cn(
          "block w-full touch-none select-none truncate rounded border-l-2 px-1.5 py-1 text-left font-mono text-[9px] transition-all",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40",
          isPending ? "cursor-wait opacity-40" : "cursor-grab active:cursor-grabbing",
          isBeingDragged && "opacity-30",
          isDone && "border-orbit-green/40 bg-orbit-green/[0.06] text-ink-dim line-through",
          isLate && "border-orbit-red bg-orbit-red/[0.08] text-orbit-red",
          isDueToday && "border-orbit-amber bg-orbit-amber/[0.08] text-orbit-amber",
          !isDone && !isLate && !isDueToday &&
            "border-white/20 bg-white/[0.04] text-ink-muted hover:bg-white/[0.07] hover:text-ink"
        )}
      >
        {task.title}
      </div>
    );
  };

  const renderAllDayEvent = (event: OrbitEvent) => {
    const cancelled = event.status === "cancelled";
    return (
      <button
        key={event.id}
        type="button"
        onClick={() => setSelectedEventId(event.id)}
        title={event.title}
        className={cn(
          "block w-full select-none truncate rounded border-l-2 px-1.5 py-1 text-left font-mono text-[9px] transition-colors",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40",
          cancelled
            ? "border-ink-faint bg-white/[0.02] text-ink-faint line-through"
            : "border-orbit-blue bg-orbit-blue/[0.10] text-orbit-blue hover:bg-orbit-blue/[0.16]"
        )}
      >
        {event.title}
      </button>
    );
  };

  return (
    <div className="mb-12 flex animate-fade-in flex-col overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.022]/40 shadow-[0_8px_32px_rgba(0,0,0,0.8)] ring-1 ring-white/5 backdrop-blur-sm">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.04] p-4">
        <h2 className="select-none font-mono text-[10px] uppercase tracking-[0.2em] text-ink-dim">
          Temporal Viewer // {view === "month" ? "Directive Calendar" : "Week Lane"}
        </h2>

        <div className="flex flex-wrap items-center gap-1">
          {/* View toggle */}
          <div
            role="tablist"
            aria-label="Calendar scale"
            className="mr-2 flex items-center gap-1 rounded-lg bg-white/[0.022] p-0.5 ring-1 ring-inset ring-white/[0.06]"
          >
            {([
              { id: "month", icon: CalendarDays, label: "Month" },
              { id: "week", icon: Columns3, label: "Week" },
            ] as const).map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                role="tab"
                aria-selected={view === id}
                onClick={() => setView(id)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-[9px] uppercase tracking-[0.16em] transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25",
                  view === id
                    ? "bg-white/[0.08] text-ink ring-1 ring-inset ring-white/[0.09]"
                    : "text-ink-dim hover:bg-white/[0.04] hover:text-ink-muted"
                )}
              >
                <Icon className="h-3 w-3" aria-hidden />
                {label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() =>
              setCursor((c) => (view === "month" ? subMonths(c, 1) : subWeeks(c, 1)))
            }
            aria-label={view === "month" ? "Previous month" : "Previous week"}
            className="rounded-lg p-1.5 text-ink-dim transition-colors hover:bg-white/[0.04] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25"
          >
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
          </button>

          <span className="min-w-[9.5rem] select-none text-center font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">
            {view === "month"
              ? format(cursor, "MMMM yyyy")
              : `${format(weekDays[0], "d MMM")} – ${format(weekDays[6], "d MMM")}`}
          </span>

          <button
            type="button"
            onClick={() =>
              setCursor((c) => (view === "month" ? addMonths(c, 1) : addWeeks(c, 1)))
            }
            aria-label={view === "month" ? "Next month" : "Next week"}
            className="rounded-lg p-1.5 text-ink-dim transition-colors hover:bg-white/[0.04] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25"
          >
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          </button>

          <button
            type="button"
            onClick={() => setCursor(new Date())}
            className="ml-1 rounded-lg px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.18em] text-ink-dim ring-1 ring-inset ring-white/[0.06] transition-colors hover:bg-white/[0.04] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25"
          >
            Today
          </button>

          <button
            type="button"
            onClick={() => {
              setCreateDateKey(todayKey);
              setCreateOpen(true);
            }}
            className="ml-2 flex items-center gap-1.5 rounded-lg bg-white/[0.06] px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.18em] text-ink ring-1 ring-inset ring-white/[0.09] transition-colors hover:bg-white/[0.10] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25"
          >
            <Plus className="h-3 w-3" aria-hidden />
            Schedule
          </button>
        </div>
      </div>

      {/* ---------------- Month view ---------------- */}
      {view === "month" && (
        <>
          <div className="grid grid-cols-7 border-b border-white/[0.04]">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <div
                key={d}
                className="select-none border-l border-white/[0.04] px-2 py-2 font-mono text-[9px] uppercase tracking-[0.16em] text-ink-dim first:border-l-0"
              >
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {monthDays.map((day) => {
              const key = toDateKey(day);
              const dayTasks = byDay.get(key) ?? [];
              const dayAllDay = allDayByDay.get(key) ?? [];
              const dayTimed = timedByDay.get(key) ?? [];
              const inMonth = isSameMonth(day, cursor);
              const isToday = key === todayKey;
              const isDropTarget = dropTargetKey === key;

              return (
                <div
                  key={key}
                  data-date-key={key}
                  onDoubleClick={() => {
                    setCreateDateKey(key);
                    setCreateOpen(true);
                  }}
                  className={cn(
                    "min-h-[112px] border-l border-t border-white/[0.04] p-1.5 transition-colors [&:nth-child(7n+1)]:border-l-0",
                    !inMonth && "bg-black/20",
                    isDropTarget && "bg-white/[0.05] ring-1 ring-inset ring-white/20"
                  )}
                >
                  <div className="mb-1.5 flex items-center justify-between px-0.5">
                    <span
                      className={cn(
                        "select-none font-mono text-[10px] tabular-nums",
                        isToday
                          ? "rounded bg-orbit-red/10 px-1.5 py-0.5 text-orbit-red ring-1 ring-orbit-red/20"
                          : inMonth
                            ? "text-ink-muted"
                            : "text-ink-faint"
                      )}
                    >
                      {format(day, "d")}
                    </span>
                    {dayTasks.length + dayAllDay.length + dayTimed.length > 3 && (
                      <span className="select-none font-mono text-[9px] tabular-nums text-ink-faint">
                        {dayTasks.length + dayAllDay.length + dayTimed.length}
                      </span>
                    )}
                  </div>

                  {/* Overdue rollup — one chip on today rather than stale
                      chips scattered across every past week. */}
                  {isToday && overdue.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setOverdueOpen((v) => !v)}
                      aria-expanded={overdueOpen}
                      className="mb-1 flex w-full items-center gap-1.5 rounded border-l-2 border-orbit-red bg-orbit-red/10 px-1.5 py-1 text-left font-mono text-[9px] text-orbit-red transition-colors hover:bg-orbit-red/[0.16] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-orbit-red/50"
                    >
                      <AlertCircle className="h-2.5 w-2.5 shrink-0" aria-hidden />
                      <span className="truncate">{overdue.length} overdue</span>
                    </button>
                  )}

                  <div className="flex flex-col gap-1">
                    {dayAllDay.map(renderAllDayEvent)}

                    {/* Timed engagements collapse to a time-stamped line in
                        month view — the cell has no vertical scale to
                        place them on honestly. */}
                    {dayTimed.map((event) => (
                      <button
                        key={event.id}
                        type="button"
                        onClick={() => setSelectedEventId(event.id)}
                        title={event.title}
                        className={cn(
                          "flex w-full select-none items-center gap-1.5 rounded px-1.5 py-1 text-left font-mono text-[9px] transition-colors",
                          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40",
                          event.status === "cancelled"
                            ? "text-ink-faint line-through hover:bg-white/[0.03]"
                            : "text-ink-muted hover:bg-white/[0.05] hover:text-ink"
                        )}
                      >
                        <span
                          className={cn(
                            "h-1.5 w-1.5 shrink-0 rounded-full",
                            event.status === "cancelled" ? "bg-ink-faint" : "bg-orbit-blue"
                          )}
                          aria-hidden
                        />
                        <span className="shrink-0 tabular-nums opacity-70">
                          {format(event.startAt.toDate(), "HH:mm")}
                        </span>
                        <span className="truncate">{event.title}</span>
                      </button>
                    ))}

                    {dayTasks.map((task) => renderTaskChip(task, key))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ---------------- Week view ---------------- */}
      {view === "week" && (
        <>
          {/* Day header */}
          <div className="grid border-b border-white/[0.04]" style={{ gridTemplateColumns: "56px repeat(7, 1fr)" }}>
            <div />
            {weekDays.map((day) => {
              const key = toDateKey(day);
              const isToday = key === todayKey;
              return (
                <div
                  key={key}
                  className="select-none border-l border-white/[0.04] px-2 py-2 font-mono text-[9px] uppercase tracking-[0.16em]"
                >
                  <span className={isToday ? "text-orbit-red" : "text-ink-dim"}>
                    {format(day, "EEE")}
                  </span>{" "}
                  <span className={cn("tabular-nums", isToday ? "text-orbit-red" : "text-ink-muted")}>
                    {format(day, "d")}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Date lane — whole-day items, no geometry beyond order */}
          <div
            className="grid border-b border-white/[0.06] bg-black/20"
            style={{ gridTemplateColumns: "56px repeat(7, 1fr)" }}
          >
            <div className="select-none py-2 pr-2 text-right font-mono text-[8px] uppercase leading-tight tracking-[0.12em] text-ink-faint">
              all
              <br />
              day
            </div>
            {weekDays.map((day) => {
              const key = toDateKey(day);
              const isDropTarget = dropTargetKey === key;
              return (
                <div
                  key={key}
                  data-date-key={key}
                  className={cn(
                    "flex min-h-[56px] flex-col gap-1 border-l border-white/[0.04] p-1.5 transition-colors",
                    isDropTarget && "bg-white/[0.05] ring-1 ring-inset ring-white/20"
                  )}
                >
                  {key === todayKey && overdue.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setOverdueOpen((v) => !v)}
                      aria-expanded={overdueOpen}
                      className="flex w-full items-center gap-1.5 rounded border-l-2 border-orbit-red bg-orbit-red/10 px-1.5 py-1 text-left font-mono text-[9px] text-orbit-red transition-colors hover:bg-orbit-red/[0.16]"
                    >
                      <AlertCircle className="h-2.5 w-2.5 shrink-0" aria-hidden />
                      <span className="truncate">{overdue.length} overdue</span>
                    </button>
                  )}
                  {(allDayByDay.get(key) ?? []).map(renderAllDayEvent)}
                  {(byDay.get(key) ?? []).map((task) => renderTaskChip(task, key))}
                </div>
              );
            })}
          </div>

          {/* Instant lane */}
          <div
            className="grid overflow-x-auto"
            style={{ gridTemplateColumns: "56px repeat(7, 1fr)" }}
          >
            {/* Hour rail */}
            <div className="relative select-none" style={{ height: laneHeight }}>
              {Array.from({ length: window.endHour - window.startHour }, (_, i) => (
                <div
                  key={i}
                  className="absolute right-2 -translate-y-1/2 font-mono text-[9px] tabular-nums text-ink-faint"
                  style={{ top: i * PX_PER_HOUR }}
                >
                  {String(window.startHour + i).padStart(2, "0")}
                </div>
              ))}
            </div>

            {weekDays.map((day) => {
              const key = toDateKey(day);
              const dayEvents = timedByDay.get(key) ?? [];

              const boxes = layoutCollisions(
                dayEvents.map((e) => ({
                  id: e.id,
                  startMs: e.startAt.toMillis(),
                  endMs: e.endAt.toMillis(),
                }))
              );

              return (
                <div
                  key={key}
                  className="relative border-l border-white/[0.04]"
                  style={{ height: laneHeight }}
                  onDoubleClick={() => {
                    setCreateDateKey(key);
                    setCreateOpen(true);
                  }}
                >
                  {/* Hour rules */}
                  {Array.from({ length: window.endHour - window.startHour }, (_, i) => (
                    <div
                      key={i}
                      className="absolute inset-x-0 border-t border-white/[0.03]"
                      style={{ top: i * PX_PER_HOUR }}
                      aria-hidden
                    />
                  ))}

                  {dayEvents.map((event) => {
                    const box = boxes.get(event.id);
                    if (!box) return null;

                    const start = event.startAt.toDate();
                    const end = event.endAt.toDate();
                    const startMins =
                      start.getHours() * 60 + start.getMinutes() - window.startHour * 60;
                    const durationMins = Math.max(
                      15,
                      (end.getTime() - start.getTime()) / 60_000
                    );

                    const cancelled = event.status === "cancelled";
                    const myRsvp = event.rsvp?.[uid] ?? "pending";
                    const unanswered = !cancelled && myRsvp === "pending";

                    return (
                      <button
                        key={event.id}
                        type="button"
                        onClick={() => setSelectedEventId(event.id)}
                        title={`${format(start, "HH:mm")}–${format(end, "HH:mm")} ${event.title}`}
                        className={cn(
                          "absolute overflow-hidden rounded border-l-2 px-1.5 py-1 text-left font-mono text-[9px] leading-tight transition-colors",
                          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/50",
                          cancelled
                            ? "border-ink-faint bg-white/[0.03] text-ink-faint line-through"
                            : unanswered
                              ? "border-orbit-amber bg-orbit-amber/[0.10] text-orbit-amber hover:bg-orbit-amber/[0.16]"
                              : "border-orbit-blue bg-orbit-blue/[0.12] text-ink hover:bg-orbit-blue/[0.18]",
                          selectedEventId === event.id && "ring-1 ring-white/40"
                        )}
                        style={{
                          top: (startMins / 60) * PX_PER_HOUR,
                          height: (durationMins / 60) * PX_PER_HOUR - 2,
                          left: `calc(${box.left * 100}% + 2px)`,
                          width: `calc(${box.width * 100}% - 4px)`,
                        }}
                      >
                        <span className="block tabular-nums opacity-70">
                          {format(start, "HH:mm")}
                        </span>
                        <span className="block truncate">{event.title}</span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ---------------- Engagement detail ---------------- */}
      {selectedEvent && (
        <div className="animate-fade-in border-t border-white/[0.06] bg-orbit-blue/[0.03] p-4">
          <div className="mb-3 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h3 className="truncate text-[15px] font-medium tracking-tight text-ink">
                {selectedEvent.title}
                {selectedEvent.status === "cancelled" && (
                  <span className="ml-2 font-mono text-[9px] uppercase tracking-[0.16em] text-orbit-red">
                    Cancelled
                  </span>
                )}
              </h3>
              <p className="mt-1 font-mono text-[10px] tabular-nums text-ink-dim">
                {selectedEvent.allDay
                  ? `${format(parseDateKey(selectedEvent.startDateKey), "EEE d MMM")} · all day`
                  : `${format(selectedEvent.startAt.toDate(), "EEE d MMM · HH:mm")}–${format(
                      selectedEvent.endAt.toDate(),
                      "HH:mm"
                    )}`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedEventId(null)}
              aria-label="Close engagement detail"
              className="shrink-0 rounded-lg p-1 text-ink-dim transition-colors hover:bg-white/[0.05] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>

          {selectedEvent.description && (
            <p className="mb-3 max-w-[70ch] text-[13px] leading-relaxed text-ink-muted">
              {selectedEvent.description}
            </p>
          )}

          <div className="mb-4 flex flex-wrap items-center gap-4">
            {selectedEvent.location && (
              <span className="flex items-center gap-1.5 font-mono text-[10px] text-ink-dim">
                <MapPin className="h-3 w-3" aria-hidden />
                {selectedEvent.location}
              </span>
            )}
            {selectedEvent.meetingUrl && (
              <a
                href={selectedEvent.meetingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 font-mono text-[10px] text-orbit-blue hover:underline"
              >
                <Video className="h-3 w-3" aria-hidden />
                Join
              </a>
            )}
          </div>

          {/* Attendees */}
          <div className="mb-4 flex flex-wrap gap-1.5">
            {selectedEvent.attendees.map((attendeeId) => {
              const member = members.find((m) => m.id === attendeeId);
              const status = selectedEvent.rsvp?.[attendeeId] ?? "pending";
              return (
                <span
                  key={attendeeId}
                  className={cn(
                    "flex items-center gap-1.5 rounded border px-2 py-1 font-mono text-[9px]",
                    status === "accepted" && "border-orbit-green/25 bg-orbit-green/[0.07] text-orbit-green",
                    status === "declined" && "border-orbit-red/25 bg-orbit-red/[0.07] text-orbit-red",
                    status === "tentative" && "border-orbit-amber/25 bg-orbit-amber/[0.07] text-orbit-amber",
                    status === "pending" && "border-white/[0.08] bg-white/[0.03] text-ink-dim"
                  )}
                >
                  {member?.name || "Unknown operative"}
                  <span className="opacity-60">· {RSVP_LABEL[status]}</span>
                </span>
              );
            })}
          </div>

          {/* Your response */}
          {selectedEvent.status !== "cancelled" && selectedEvent.attendees.includes(uid) && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-dim">
                Your response
              </span>
              {(["accepted", "tentative", "declined"] as const).map((status) => {
                const active = (selectedEvent.rsvp?.[uid] ?? "pending") === status;
                return (
                  <button
                    key={status}
                    type="button"
                    disabled={busy}
                    onClick={() => respond(selectedEvent.id, status)}
                    className={cn(
                      "rounded-lg px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.16em] ring-1 ring-inset transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25 disabled:opacity-40",
                      active
                        ? "bg-white/[0.10] text-ink ring-white/[0.14]"
                        : "text-ink-dim ring-white/[0.06] hover:bg-white/[0.05] hover:text-ink"
                    )}
                  >
                    {RSVP_LABEL[status]}
                  </button>
                );
              })}

              {selectedEvent.createdBy === uid && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => cancelEngagement(selectedEvent.id)}
                  className="ml-auto rounded-lg px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.16em] text-orbit-red ring-1 ring-inset ring-orbit-red/20 transition-colors hover:bg-orbit-red/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orbit-red/40 disabled:opacity-40"
                >
                  Cancel engagement
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ---------------- Overdue detail ---------------- */}
      {overdueOpen && overdue.length > 0 && (
        <div className="animate-fade-in border-t border-white/[0.04] bg-orbit-red/[0.03] p-4">
          <div className="mb-3 flex items-center gap-2">
            <AlertCircle className="h-3 w-3 text-orbit-red" aria-hidden />
            <span className="select-none font-mono text-[10px] uppercase tracking-[0.16em] text-orbit-red">
              {overdue.length} directive{overdue.length === 1 ? "" : "s"} past horizon
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {overdue.map((task) => (
              <div
                key={task.id}
                {...chipProps(task)}
                className={cn(
                  "flex max-w-full touch-none select-none items-center gap-2 rounded border border-orbit-red/20 bg-orbit-red/[0.06] px-2 py-1 font-mono text-[9px] text-orbit-red transition-colors",
                  "hover:bg-orbit-red/[0.12] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-orbit-red/50",
                  pending.has(task.id) ? "cursor-wait opacity-40" : "cursor-grab active:cursor-grabbing",
                  drag?.moved && drag.taskId === task.id && "opacity-30"
                )}
              >
                <span className="truncate">{task.title}</span>
                <span className="shrink-0 tabular-nums opacity-60">
                  {format(parseDateKey(dueDateKeyOf(task)!), "d MMM")}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ---------------- Unscheduled tray ---------------- */}
      {unscheduled.length > 0 && (
        <div className="border-t border-white/[0.04] p-4">
          <div className="mb-3 flex items-center gap-2">
            <Inbox className="h-3 w-3 text-ink-dim" aria-hidden />
            <span className="select-none font-mono text-[10px] uppercase tracking-[0.16em] text-ink-dim">
              {unscheduled.length} unscheduled — drag onto a day to set a horizon
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {unscheduled.map((task) => (
              <div
                key={task.id}
                {...chipProps(task)}
                className={cn(
                  "max-w-full touch-none select-none truncate rounded border border-white/[0.08] bg-white/[0.03] px-2 py-1 font-mono text-[9px] text-ink-muted transition-colors",
                  "hover:bg-white/[0.06] hover:text-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40",
                  pending.has(task.id) ? "cursor-wait opacity-40" : "cursor-grab active:cursor-grabbing",
                  drag?.moved && drag.taskId === task.id && "opacity-30"
                )}
              >
                {task.title}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Drag ghost. Portalled to <body> because this panel's backdrop
          filter would otherwise become its containing block and the
          surrounding overflow-hidden would clip it. */}
      {typeof document !== "undefined" &&
        drag?.moved &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[100] max-w-[240px] truncate rounded border-l-2 border-white/50 bg-[#141618] px-2 py-1 font-mono text-[9px] text-ink shadow-[0_8px_28px_rgba(0,0,0,0.7)] ring-1 ring-white/10"
            style={{ left: drag.x + 14, top: drag.y + 14 }}
          >
            {drag.title}
          </div>,
          document.body
        )}

      <CreateEventDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        projectId={projectId}
        members={members}
        currentUserId={uid}
        defaultDateKey={createDateKey}
      />
    </div>
  );
}
