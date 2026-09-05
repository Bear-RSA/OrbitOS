"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  eachMonthOfInterval,
  eachWeekOfInterval,
  format,
  isWeekend,
} from "date-fns";
import { ChevronDown, ChevronRight, CalendarClock, Crosshair, Map } from "lucide-react";
import { Task } from "@/types/task";
import { Member } from "@/types/member";
import { cn } from "@/lib/utils/classnames";
import { parseDateKey, toDateKey } from "@/lib/utils/dates";
import { useNow } from "@/hooks/use-now";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import {
  buildRoadmap,
  dayIndex,
  shiftKey,
  RoadmapBar,
  RoadmapState,
} from "@/lib/roadmap/build";

/* ------------------------------------------------------------------ */
/*  Deployment Roadmap                                                 */
/*                                                                     */
/*  A Gantt over the project's directives, in milestone lanes.         */
/*                                                                     */
/*  Milestones are the spine of this project everywhere else — the     */
/*  objective list groups by them, briefings are filed against them,   */
/*  the pulse counts activity per milestone — so the roadmap groups by */
/*  them too. A flat list of bars answers "when is each task due";     */
/*  lanes answer "is the milestone going to land", which is the        */
/*  question a roadmap exists for.                                     */
/*                                                                     */
/*  Everything is derived from the `tasks` prop, which the project     */
/*  page already holds open as a Firestore subscription. This panel    */
/*  used to re-read the whole task collection through a server action  */
/*  on every one of those updates — a second full read of data already */
/*  in memory, arriving a round trip behind the table below it. Now a  */
/*  status change moves the bar in the same frame it moves the row.    */
/*                                                                     */
/*  Placement, span and lateness all live in `lib/roadmap/build`,      */
/*  under test. What is left here is the drawing.                      */
/* ------------------------------------------------------------------ */

/** Width of the frozen milestone column. */
const LANE_LABEL_W_FULL = 148;
/** Same column on a handset, where 148px would be most of the screen. */
const LANE_LABEL_W_COMPACT = 92;
/** Height of one bar row, and of a lane header. */
const ROW_H = 30;
/** Height of the frozen timescale. */
const HEADER_H = 44;
/** Pointer travel, in px, before a press stops being a click. */
const DRAG_THRESHOLD = 4;
/** Narrower than this and the title goes beside the bar, not inside it. */
const INLINE_LABEL_MIN_W = 72;
/** Weekend shading is per-day markup; past this many days it stops earning it. */
const WEEKEND_SHADING_MAX_DAYS = 140;

const ZOOMS = [
  { id: "year", label: "Year", pxPerDay: 3.2 },
  { id: "quarter", label: "Quarter", pxPerDay: 8 },
  { id: "month", label: "Month", pxPerDay: 20 },
  { id: "week", label: "Week", pxPerDay: 48 },
] as const;

type ZoomId = (typeof ZOOMS)[number]["id"];

/** The densest scale that still fits the whole project on a wide screen. */
function autoZoom(totalDays: number): ZoomId {
  if (totalDays <= 35) return "week";
  if (totalDays <= 110) return "month";
  if (totalDays <= 420) return "quarter";
  return "year";
}

const STATE_STYLE: Record<RoadmapState, { bar: string; text: string; dot: string; label: string }> = {
  done: {
    bar: "bg-orbit-green/[0.14] border-orbit-green/30 hover:border-orbit-green/50",
    text: "text-orbit-green",
    dot: "bg-orbit-green",
    label: "Executed",
  },
  blocked: {
    bar: "bg-orbit-amber/[0.12] border-orbit-amber/40 hover:border-orbit-amber/60",
    text: "text-orbit-amber",
    dot: "bg-orbit-amber",
    label: "Blocked",
  },
  overdue: {
    bar: "bg-orbit-red/[0.10] border-orbit-red/40 hover:border-orbit-red/60",
    text: "text-orbit-red",
    dot: "bg-orbit-red",
    label: "Overdue",
  },
  active: {
    bar: "bg-orbit-blue/[0.12] border-orbit-blue/35 hover:border-orbit-blue/55",
    text: "text-orbit-blue",
    dot: "bg-orbit-blue",
    label: "In flight",
  },
  planned: {
    bar: "bg-surface-control border-line/[0.10] hover:border-line/[0.20]",
    text: "text-ink-muted",
    dot: "bg-ink-faint",
    label: "Planned",
  },
};

/** Scrolls to the task's row in the table below and flashes it. Mirrors
 *  the calendar's behaviour so both viewers feel like the same control. */
function revealTask(taskId: string) {
  const target = document.getElementById(`task-${taskId}`);
  if (!target) return;
  target.scrollIntoView({ behavior: "smooth", block: "center" });
  target.classList.add("ring-1", "ring-focus", "transition-all", "duration-500");
  setTimeout(() => target.classList.remove("ring-1", "ring-focus"), 1500);
}

/**
 * Width of the frozen milestone column, narrowed on a handset.
 *
 * It cannot be a Tailwind breakpoint: the same number positions the
 * today marker, the gridlines and every scroll target, so JavaScript has
 * to know it too. Left at its full width on a 375px screen it took
 * nearly half the panel and left the timeline itself a gutter.
 */
function useLaneLabelWidth(): number {
  // Starts wide so the server render and the first client render agree.
  const [width, setWidth] = useState(LANE_LABEL_W_FULL);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 640px)");
    const sync = () =>
      setWidth(media.matches ? LANE_LABEL_W_FULL : LANE_LABEL_W_COMPACT);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  return width;
}

function initialsOf(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

interface SystemRoadmapProps {
  tasks: Task[];
  members: Member[];
}

export function SystemRoadmap({ tasks, members }: SystemRoadmapProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const labelW = useLaneLabelWidth();

  /* Five minutes is well inside a day, which is the only granularity
     anything here reads. It exists so a roadmap left open overnight
     rolls its "today" marker rather than freezing on yesterday. */
  const now = useNow(300_000);
  const todayKey = toDateKey(new Date(now));

  const [showCompleted, setShowCompleted] = useState(true);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  /** null until the operator picks a scale, then theirs wins. */
  const [zoomChoice, setZoomChoice] = useState<ZoomId | null>(null);

  const model = useMemo(
    () => buildRoadmap(tasks, todayKey, { includeDone: showCompleted }),
    [tasks, todayKey, showCompleted]
  );

  const zoom = zoomChoice ?? autoZoom(model.totalDays);
  const pxPerDay = ZOOMS.find((z) => z.id === zoom)!.pxPerDay;
  const totalWidth = model.totalDays * pxPerDay;

  /** Pixels from the left edge of the timeline to the start of a day. */
  const xOf = useCallback(
    (key: string) => dayIndex(model.startKey, key) * pxPerDay,
    [model.startKey, pxPerDay]
  );

  const todayX = xOf(todayKey);

  const centreOnToday = useCallback(
    (smooth: boolean) => {
      const el = scrollRef.current;
      if (!el) return;
      el.scrollTo({
        left: Math.max(0, labelW + todayX - el.clientWidth / 2),
        behavior: smooth && !reducedMotion ? "smooth" : "auto",
      });
    },
    [todayX, reducedMotion, labelW]
  );

  /* True from the first pan, zoom or wheel. Until then the panel is
     still showing its opening position rather than a chosen one. */
  const interacted = useRef(false);

  /* Hold today in the middle until the operator moves the view.
     Centring once on mount is not enough: the panel is sized by its
     parent, and the width on that first pass is not always the width it
     settles at, which leaves today sitting off to one side. Watching the
     box instead re-centres through layout settling and window resizes,
     and stops the moment the view becomes someone's own. */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || model.lanes.length === 0) return;

    const observer = new ResizeObserver(() => {
      if (interacted.current || el.clientWidth === 0) return;
      centreOnToday(false);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [centreOnToday, model.lanes.length]);

  /* Whichever day sits in the middle of the panel stays there across a
     zoom. Without this the timeline snaps back to its left edge every
     time the scale changes, which sends you hunting for your place —
     the one thing a zoom control exists to avoid.

     The anchor is a date rather than a pixel offset so it survives the
     rescale, and it is captured on the click because by the time the
     effect runs `pxPerDay` is already the new one and the old centre is
     unrecoverable. The filter needs no such treatment: the window spans
     every directive whether or not the view is hiding some, so hiding
     executed work leaves the axis exactly where it was. */
  const zoomAnchorKey = useRef<string | null>(null);

  const changeZoom = (next: ZoomId) => {
    const el = scrollRef.current;
    if (el && el.clientWidth > 0) {
      interacted.current = true;
      const centreDay = (el.scrollLeft + el.clientWidth / 2 - labelW) / pxPerDay;
      zoomAnchorKey.current = shiftKey(model.startKey, Math.round(centreDay));
    }
    setZoomChoice(next);
  };

  useLayoutEffect(() => {
    const el = scrollRef.current;
    const anchor = zoomAnchorKey.current;
    if (!el || anchor === null) return;
    zoomAnchorKey.current = null;
    el.scrollLeft = Math.max(0, labelW + xOf(anchor) - el.clientWidth / 2);
  }, [pxPerDay, xOf, labelW]);

  /* Drag-to-pan. Window listeners rather than element ones so a pointer
     that leaves the panel mid-drag still moves it, with a ref holding
     the teardown so unmounting mid-drag cannot strand them. */
  const releaseDrag = useRef<(() => void) | null>(null);
  useEffect(() => () => releaseDrag.current?.(), []);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    // A press that starts on a bar is aiming at the bar.
    if ((event.target as HTMLElement).closest("button")) return;
    if (event.button !== 0) return;

    const el = scrollRef.current;
    if (!el) return;

    interacted.current = true;
    const startX = event.clientX;
    const startScroll = el.scrollLeft;

    const onMove = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - startX;
      if (Math.abs(dx) < DRAG_THRESHOLD) return;
      el.scrollLeft = startScroll - dx;
    };

    const teardown = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", teardown);
      window.removeEventListener("pointercancel", teardown);
      releaseDrag.current = null;
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", teardown);
    window.addEventListener("pointercancel", teardown);
    releaseDrag.current = teardown;
  };

  const toggleLane = (milestone: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(milestone)) next.delete(milestone);
      else next.add(milestone);
      return next;
    });
  };

  const nameOf = useCallback(
    (uid: string) => members.find((m) => m.id === uid)?.name ?? "Unknown operative",
    [members]
  );

  const windowStart = parseDateKey(model.startKey);
  const windowEnd = parseDateKey(model.endKey);
  const months = eachMonthOfInterval({ start: windowStart, end: windowEnd });
  const weeks =
    pxPerDay >= 8
      ? eachWeekOfInterval({ start: windowStart, end: windowEnd }, { weekStartsOn: 1 })
      : [];
  const weekendDays =
    pxPerDay >= 20 && model.totalDays <= WEEKEND_SHADING_MAX_DAYS
      ? Array.from({ length: model.totalDays }, (_, i) => shiftKey(model.startKey, i)).filter(
          (key) => isWeekend(parseDateKey(key))
        )
      : [];

  const drawnCount = model.lanes.reduce((sum, lane) => sum + lane.bars.length, 0);
  const isEmpty = drawnCount === 0 && model.unscheduled.length === 0;

  return (
    <div className="mb-12 flex flex-col overflow-hidden rounded-xl border border-line/[0.06] bg-surface-card/40 shadow-raised ring-1 ring-line/5 backdrop-blur-sm animate-fade-in">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/[0.04] p-4">
        <div className="flex items-center gap-2.5">
          <Map className="h-3.5 w-3.5 text-ink-dim" aria-hidden />
          <h2 className="select-none font-mono text-[10px] uppercase tracking-[0.2em] text-ink-dim">
            Deployment Roadmap
          </h2>
          {!isEmpty && (
            <span className="font-mono text-[10px] tabular-nums text-ink-faint">
              {model.lanes.length} milestone{model.lanes.length === 1 ? "" : "s"} · {drawnCount} plotted
            </span>
          )}
        </div>

        {!isEmpty && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowCompleted((visible) => !visible)}
              aria-pressed={showCompleted}
              className={cn(
                "rounded-lg px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.14em] transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
                showCompleted
                  ? "bg-surface-hover text-ink-muted ring-1 ring-inset ring-line/[0.08]"
                  : "text-ink-dim hover:bg-surface-raised hover:text-ink-muted"
              )}
            >
              Executed
            </button>

            <div
              role="group"
              aria-label="Timeline scale"
              className="flex items-center gap-0.5 rounded-lg bg-surface-card p-0.5 ring-1 ring-inset ring-line/[0.06]"
            >
              {ZOOMS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => changeZoom(option.id)}
                  aria-pressed={zoom === option.id}
                  className={cn(
                    "rounded-md px-2 py-1 font-mono text-[9px] uppercase tracking-[0.12em] transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
                    zoom === option.id
                      ? "bg-surface-hover text-ink ring-1 ring-inset ring-line/[0.09]"
                      : "text-ink-dim hover:text-ink-muted"
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => centreOnToday(true)}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-ink-dim transition-colors hover:bg-surface-raised hover:text-ink-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              <Crosshair className="h-3 w-3" aria-hidden />
              Today
            </button>
          </div>
        )}
      </div>

      {isEmpty ? (
        <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
          <CalendarClock className="h-5 w-5 text-ink-faint" aria-hidden />
          <p className="text-[13px] text-ink-muted">Nothing to plot yet.</p>
          <p className="max-w-sm text-[12px] text-ink-dim">
            Give a directive a milestone and a horizon and it appears here as a bar on
            the timeline.
          </p>
        </div>
      ) : (
        <>
          {/* ── Timeline ── */}
          <div
            ref={scrollRef}
            onPointerDown={handlePointerDown}
            onWheel={() => {
              interacted.current = true;
            }}
            className="custom-scrollbar relative max-h-[560px] cursor-grab overflow-auto overscroll-x-contain active:cursor-grabbing"
          >
            <div className="relative min-w-full" style={{ width: labelW + totalWidth }}>
              {/* Timescale — frozen to the top of the scroll box. */}
              <div
                className="sticky top-0 z-40 flex border-b border-line/[0.06] bg-surface-sunken"
                style={{ height: HEADER_H }}
              >
                <div
                  className="sticky left-0 z-50 shrink-0 border-r border-line/[0.06] bg-surface-sunken"
                  style={{ width: labelW }}
                />
                <div className="relative shrink-0" style={{ width: totalWidth }}>
                  {months.map((month) => (
                    <div
                      key={month.getTime()}
                      className="absolute inset-y-0 border-l border-line/[0.08] pl-2 pt-2"
                      style={{ left: xOf(toDateKey(month)) }}
                    >
                      <span className="whitespace-nowrap font-mono text-[9px] uppercase tracking-[0.16em] text-ink-muted">
                        {format(month, pxPerDay >= 8 ? "MMM yyyy" : "MMM")}
                      </span>
                    </div>
                  ))}
                  {weeks.map((week) => (
                    <div
                      key={week.getTime()}
                      className="absolute bottom-1.5 font-mono text-[8px] tabular-nums text-ink-faint"
                      style={{ left: xOf(toDateKey(week)) + 3 }}
                    >
                      {format(week, "d")}
                    </div>
                  ))}
                </div>
              </div>

              {/* Lanes, over a shared grid. */}
              <div className="relative">
                <div
                  className="pointer-events-none absolute inset-y-0 z-0"
                  style={{ left: labelW, width: totalWidth }}
                  aria-hidden
                >
                  {weekendDays.map((key) => (
                    <div
                      key={key}
                      className="absolute inset-y-0 bg-ink/[0.035]"
                      style={{ left: xOf(key), width: pxPerDay }}
                    />
                  ))}
                  {months.map((month) => (
                    <div
                      key={month.getTime()}
                      className="absolute inset-y-0 border-l border-line/[0.06]"
                      style={{ left: xOf(toDateKey(month)) }}
                    />
                  ))}
                </div>

                {/* Today. Above the grid, below the bars. */}
                <div
                  className="pointer-events-none absolute inset-y-0 z-10 w-px bg-orbit-red/40"
                  style={{ left: labelW + todayX }}
                  aria-hidden
                />

                {model.lanes.map((lane) => {
                  const isCollapsed = collapsed.has(lane.milestone);
                  const laneX = xOf(lane.startKey);
                  const laneW = Math.max(
                    pxPerDay,
                    (dayIndex(lane.startKey, lane.endKey) + 1) * pxPerDay
                  );
                  const progress =
                    lane.totalCount === 0 ? 0 : lane.doneCount / lane.totalCount;

                  return (
                    <section key={lane.milestone}>
                      {/* Lane header — the milestone's own summary bar. */}
                      <div className="flex border-t border-line/[0.04]" style={{ height: ROW_H }}>
                        <button
                          type="button"
                          onClick={() => toggleLane(lane.milestone)}
                          aria-expanded={!isCollapsed}
                          title={`${lane.milestone} — ${lane.doneCount} of ${lane.totalCount} executed`}
                          className="sticky left-0 z-30 flex shrink-0 items-center gap-1.5 border-r border-line/[0.06] bg-surface-sunken px-2 text-left transition-colors hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus"
                          style={{ width: labelW }}
                        >
                          {isCollapsed ? (
                            <ChevronRight className="h-3 w-3 shrink-0 text-ink-dim" aria-hidden />
                          ) : (
                            <ChevronDown className="h-3 w-3 shrink-0 text-ink-dim" aria-hidden />
                          )}
                          <span className="truncate text-[11px] font-medium text-ink">
                            {lane.milestone}
                          </span>
                          <span className="ml-auto shrink-0 font-mono text-[9px] tabular-nums text-ink-dim">
                            {lane.doneCount}/{lane.totalCount}
                          </span>
                        </button>

                        <div className="relative shrink-0" style={{ width: totalWidth }}>
                          <div
                            className="absolute top-1/2 z-20 h-2 -translate-y-1/2 overflow-hidden rounded-full bg-surface-control ring-1 ring-inset ring-line/[0.08]"
                            style={{ left: laneX, width: laneW }}
                          >
                            <div
                              className="h-full bg-orbit-green/40"
                              style={{ width: `${Math.round(progress * 100)}%` }}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Bars. */}
                      {!isCollapsed &&
                        lane.bars.map((bar) => (
                          <BarRow
                            key={bar.taskId}
                            bar={bar}
                            xOf={xOf}
                            pxPerDay={pxPerDay}
                            totalWidth={totalWidth}
                            todayX={todayX}
                            labelW={labelW}
                            nameOf={nameOf}
                          />
                        ))}
                    </section>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ── Legend and the tasks no timeline can hold ── */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line/[0.04] px-4 py-2.5">
            {(Object.keys(STATE_STYLE) as RoadmapState[]).map((state) => (
              <span key={state} className="flex items-center gap-1.5">
                <span className={cn("h-1.5 w-1.5 rounded-full", STATE_STYLE[state].dot)} />
                <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-dim">
                  {STATE_STYLE[state].label}
                </span>
              </span>
            ))}
          </div>

          {model.unscheduled.length > 0 && (
            <div className="border-t border-line/[0.04] px-4 py-3">
              <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.16em] text-ink-dim">
                No horizon set — {model.unscheduled.length} directive
                {model.unscheduled.length === 1 ? "" : "s"} off the timeline
              </p>
              <div className="flex flex-wrap gap-1.5">
                {model.unscheduled.map((bar) => (
                  <button
                    key={bar.taskId}
                    type="button"
                    onClick={() => revealTask(bar.taskId)}
                    title={`${bar.title} — ${bar.milestone}`}
                    className="max-w-[240px] truncate rounded-md border border-dashed border-line/[0.14] px-2 py-1 text-[11px] text-ink-muted transition-colors hover:border-line/[0.28] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                  >
                    {bar.title}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  One directive                                                      */
/* ------------------------------------------------------------------ */

function BarRow({
  bar,
  xOf,
  pxPerDay,
  totalWidth,
  todayX,
  labelW,
  nameOf,
}: {
  bar: RoadmapBar;
  xOf: (key: string) => number;
  pxPerDay: number;
  totalWidth: number;
  todayX: number;
  labelW: number;
  nameOf: (uid: string) => string;
}) {
  const style = STATE_STYLE[bar.state];
  const left = xOf(bar.startKey);
  // Inclusive of both ends, and never thinner than a day so a same-day
  // directive is still something you can aim a pointer at.
  const width = Math.max(pxPerDay, (dayIndex(bar.startKey, bar.endKey) + 1) * pxPerDay);
  const inlineLabel = width >= INLINE_LABEL_MIN_W;

  const assignees = bar.assignedTo.map(nameOf);
  const horizon = bar.dueKey ? format(parseDateKey(bar.dueKey), "d MMM yyyy") : "no horizon";
  const description = [
    bar.title,
    `${style.label} · horizon ${horizon}`,
    bar.slipDays > 0 ? `delivered ${bar.slipDays} day${bar.slipDays === 1 ? "" : "s"} late` : null,
    assignees.length > 0 ? `assigned to ${assignees.join(", ")}` : "unassigned",
  ]
    .filter(Boolean)
    .join(" — ");

  return (
    <div className="flex" style={{ height: ROW_H }}>
      <div
        className="sticky left-0 z-30 shrink-0 border-r border-line/[0.06] bg-surface-sunken"
        style={{ width: labelW }}
      />
      <div className="relative shrink-0" style={{ width: totalWidth }}>
        {/* The gap between a missed horizon and today, drawn rather than
            left to arithmetic — the length of the dash is the overrun. */}
        {bar.state === "overdue" && todayX > left + width && (
          <div
            className="pointer-events-none absolute top-1/2 z-10 border-t border-dashed border-orbit-red/35"
            style={{ left: left + width, width: todayX - (left + width) }}
            aria-hidden
          />
        )}

        <button
          type="button"
          onClick={() => revealTask(bar.taskId)}
          title={description}
          aria-label={description}
          className={cn(
            "absolute top-1/2 z-20 flex -translate-y-1/2 items-center gap-1.5 rounded-[4px] border px-1.5 transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
            style.bar
          )}
          style={{ left, width, height: 22 }}
        >
          {inlineLabel && (
            <span
              className={cn(
                "truncate whitespace-nowrap text-[10px] font-medium tracking-tight",
                style.text
              )}
            >
              {bar.title}
            </span>
          )}
          {inlineLabel && bar.assignedTo.length > 0 && (
            <span className="ml-auto flex shrink-0 -space-x-1">
              {bar.assignedTo.slice(0, 2).map((uid) => (
                <span
                  key={uid}
                  className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-surface-active text-[7px] font-medium text-ink-muted ring-1 ring-line/[0.10]"
                >
                  {initialsOf(nameOf(uid))}
                </span>
              ))}
              {bar.assignedTo.length > 2 && (
                <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-surface-active text-[7px] text-ink-dim ring-1 ring-line/[0.10]">
                  +{bar.assignedTo.length - 2}
                </span>
              )}
            </span>
          )}
        </button>

        {/* Too narrow to hold its own name — put it alongside instead of
            rendering an anonymous sliver. */}
        {!inlineLabel && (
          <span
            className={cn(
              "pointer-events-none absolute top-1/2 z-20 -translate-y-1/2 whitespace-nowrap text-[10px] tracking-tight",
              style.text
            )}
            style={{ left: left + width + 6 }}
          >
            {bar.title}
          </span>
        )}
      </div>
    </div>
  );
}
