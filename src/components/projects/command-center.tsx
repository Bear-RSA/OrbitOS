"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useActivityStream, SSEActivityEvent } from "@/hooks/use-activity-stream";
import {
  describeEvent,
  TONE_COLOR,
  TONE_LABEL,
  TONE_ORDER,
  type EventTone,
} from "@/lib/formatters/event-registry";
import { cn } from "@/lib/utils/classnames";
import { SIGNAL } from "@/lib/utils/signal-colors";
import { format, isToday, isYesterday, formatDistanceToNowStrict } from "date-fns";
import { Terminal, ArrowUp, Search, X, Check, Copy, AlertTriangle } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Command Center — Telemetry Log                                     */
/*                                                                     */
/*  A live audit log, newest first. Three things make it usable rather */
/*  than decorative:                                                   */
/*                                                                     */
/*    1. It is filterable. A log nobody can query is a screensaver —   */
/*       tone chips and free text narrow it without leaving the page.  */
/*    2. It is honest. Every number shown is real: the packet counter  */
/*       is the project's lifetime total from the server, not the size */
/*       of the display window, and unmapped event types say so        */
/*       instead of borrowing the SYSTEM_BOOT badge.                   */
/*    3. It pauses when read. Scrolling away holds position and counts */
/*       what arrived; returning to the top resumes the follow.        */
/* ------------------------------------------------------------------ */

interface CommandCenterProps {
  projectId: string;
}

/** Rows kept in the DOM. Anything beyond is dropped from the tail while
 *  live — trimming is suspended when paused so scroll position holds. */
const MAX_ROWS = 120;

/** Distance from the top that still counts as "following the feed". */
const FOLLOW_THRESHOLD_PX = 12;

type ToneFilter = EventTone | "all";

/* ------------------------------------------------------------------ */
/*  Row                                                               */
/* ------------------------------------------------------------------ */

function LogRow({ event, isNew }: { event: SSEActivityEvent; isNew: boolean }) {
  const [copied, setCopied] = useState(false);
  const descriptor = describeEvent(event.eventType);
  const Icon = descriptor.icon;
  const color = TONE_COLOR[descriptor.tone];
  const ts = event.timestamp ? new Date(event.timestamp) : null;

  const copy = useCallback(() => {
    const line = [
      ts ? format(ts, "yyyy-MM-dd HH:mm:ss") : "pending",
      descriptor.label,
      event.actor?.name || "System",
      event.eventType,
      JSON.stringify(event.metadata ?? {}),
    ].join("  ");

    navigator.clipboard?.writeText(line).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1400);
      },
      () => {
        /* clipboard denied — the row simply does not confirm */
      }
    );
  }, [ts, descriptor.label, event]);

  return (
    <div
      className={cn(
        "group relative flex gap-3 rounded-lg px-3 py-2 -mx-1 transition-colors",
        "hover:bg-surface-card",
        isNew && "stream-in"
      )}
    >
      {/* Tone rail — the only element carrying the severity colour at full
          strength, so a column of rows reads as a severity histogram. */}
      <span
        aria-hidden
        className="absolute left-0 top-2 bottom-2 w-px rounded-full opacity-60"
        style={{ backgroundColor: color }}
      />

      <div
        className="mt-[3px] flex h-5 w-5 shrink-0 items-center justify-center rounded-md ring-1 ring-inset ring-line/[0.06]"
        style={{ backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)` }}
      >
        <Icon className="h-3 w-3" style={{ color }} aria-hidden />
      </div>

      <div className="min-w-0 flex-1">
        <div className="text-[11px] leading-relaxed text-ink-muted">
          <span className="font-semibold text-ink">{event.actor?.name || "System"}</span>{" "}
          {descriptor.describe(event.metadata ?? {})}
        </div>

        <div className="mt-1 flex items-center gap-2 text-[9px] uppercase tracking-[0.18em] text-ink-dim">
          <span
            className="font-semibold tabular-nums"
            style={{ color }}
            title={descriptor.tone}
          >
            {descriptor.label}
          </span>
          <span className="h-2 w-px bg-surface-hover" aria-hidden />
          {/* Absolute time is what an audit log is for; the relative form is
              what a human actually wants, so it takes the hover. */}
          <time
            dateTime={ts?.toISOString()}
            className="tabular-nums"
            title={ts ? ts.toString() : "Awaiting server timestamp"}
          >
            <span className="group-hover:hidden">
              {ts ? format(ts, "HH:mm:ss") : "--:--:--"}
            </span>
            <span className="hidden group-hover:inline">
              {ts ? `${formatDistanceToNowStrict(ts)} ago` : "pending"}
            </span>
          </time>
        </div>
      </div>

      <button
        type="button"
        onClick={copy}
        aria-label={`Copy log line for ${descriptor.label} event`}
        className="mt-[2px] h-6 w-6 shrink-0 rounded-md text-ink-faint opacity-0 ring-1 ring-inset ring-transparent transition-all hover:text-ink hover:ring-line/[0.08] focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-focus group-hover:opacity-100 flex items-center justify-center"
      >
        {copied ? (
          <Check className="h-3 w-3" style={{ color: SIGNAL.green }} />
        ) : (
          <Copy className="h-3 w-3" />
        )}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function CommandCenter({ projectId }: CommandCenterProps) {
  const { events, total, loading, connected, error } = useActivityStream({ projectId });

  const [tone, setTone] = useState<ToneFilter>("all");
  const [query, setQuery] = useState("");
  const [following, setFollowing] = useState(true);
  const [pending, setPending] = useState(0);

  const feedRef = useRef<HTMLDivElement>(null);
  const seenRef = useRef<Set<string>>(new Set());
  const lastTopIdRef = useRef<string | null>(null);

  /* --- Tone counts drive the chip labels, so a filter shows its own
         yield before it is applied. Computed over the unfiltered set. --- */
  const toneCounts = useMemo(() => {
    const counts: Record<EventTone, number> = {
      critical: 0,
      warning: 0,
      success: 0,
      info: 0,
      neutral: 0,
    };
    events.forEach((e) => {
      counts[describeEvent(e.eventType).tone] += 1;
    });
    return counts;
  }, [events]);

  /* --- Filtering. Events arrive newest-first from the hook, so no sort
         happens here; the previous version re-sorted on every render,
         hover included. --- */
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();

    const matches = events.filter((e) => {
      const descriptor = describeEvent(e.eventType);
      if (tone !== "all" && descriptor.tone !== tone) return false;
      if (!needle) return true;

      // Search the raw record rather than the rendered sentence: metadata
      // values are what the reader is actually looking for (a file name, an
      // invitee's address), and they never all reach the visible text.
      const haystack = [
        e.actor?.name,
        e.eventType,
        descriptor.label,
        ...Object.values(e.metadata ?? {}).map((v) =>
          typeof v === "string" || typeof v === "number" ? String(v) : ""
        ),
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(needle);
    });

    // Trimming only while following. Dropping rows under a reader who has
    // scrolled would yank the viewport out from under them.
    return following ? matches.slice(0, MAX_ROWS) : matches;
  }, [events, tone, query, following]);

  /* --- Group by day. A wall of identical yyyy-MM-dd stamps carries no
         information; a divider per day plus HH:mm:ss per row does. --- */
  const groups = useMemo(() => {
    const out: { key: string; label: string; rows: SSEActivityEvent[] }[] = [];

    visible.forEach((event) => {
      const ts = event.timestamp ? new Date(event.timestamp) : null;
      const key = ts ? format(ts, "yyyy-MM-dd") : "pending";
      const label = !ts
        ? "Awaiting timestamp"
        : isToday(ts)
          ? "Today"
          : isYesterday(ts)
            ? "Yesterday"
            : format(ts, "EEEE, d MMMM yyyy");

      const tail = out[out.length - 1];
      if (tail && tail.key === key) tail.rows.push(event);
      else out.push({ key, label, rows: [event] });
    });

    return out;
  }, [visible]);

  /* --- Track which ids are new this session so only genuinely new rows
         animate in. Without this every filter change replays the entrance
         animation across the whole list. --- */
  const isNew = useCallback((id: string) => !seenRef.current.has(id), []);
  useEffect(() => {
    const timer = setTimeout(() => {
      events.forEach((e) => seenRef.current.add(e.id));
    }, 400);
    return () => clearTimeout(timer);
  }, [events]);

  /* --- Unread accounting while paused. Keyed off the newest id rather
         than list length, which is capped and therefore stops changing. --- */
  useEffect(() => {
    const topId = events[0]?.id ?? null;
    if (topId === lastTopIdRef.current) return;

    const previousTop = lastTopIdRef.current;
    lastTopIdRef.current = topId;

    if (previousTop === null) return; // initial load is not "unread"

    if (!following) {
      const arrivedSince = events.findIndex((e) => e.id === previousTop);
      setPending((n) => n + (arrivedSince === -1 ? 1 : arrivedSince));
    }
  }, [events, following]);

  const jumpToLive = useCallback(() => {
    feedRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    setFollowing(true);
    setPending(0);
  }, []);

  const handleScroll = useCallback(() => {
    const el = feedRef.current;
    if (!el) return;

    const atTop = el.scrollTop < FOLLOW_THRESHOLD_PX;
    setFollowing(atTop);
    if (atTop) setPending(0);
  }, []);

  /* --- Status. `error` outranks `connected`: a stream that gave up needs
         to say so rather than sit on a green dot forever. --- */
  const status = error
    ? { text: "Offline", label: "Offline", color: SIGNAL.red }
    : !connected
      ? { text: "Reconnecting", label: "Reconnecting", color: SIGNAL.amber }
      : !following
        ? { text: "Paused", label: "Paused", color: SIGNAL.amber }
        : { text: "Live", label: "Nominal", color: SIGNAL.green };

  const filtered = tone !== "all" || query.trim().length > 0;

  return (
    <section className="animate-fade-in mt-20" aria-label="Command Center telemetry log">
      {/* ────────── HEADER ────────── */}
      <div className="mb-8 flex items-start justify-between gap-6">
        <div>
          <h2 className="mb-3 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.3em] text-ink-dim">
            <span className="h-1.5 w-1.5 rounded-full bg-surface-raised ring-1 ring-line/[0.08]" />
            System Diagnostics
          </h2>
          <div className="flex items-center gap-4">
            <h3 className="text-2xl font-light tracking-tight text-ink">Command Center</h3>
            <span className="h-4 w-px bg-surface-control" />
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                {!error && (
                  <span
                    className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-40"
                    style={{ backgroundColor: status.color }}
                  />
                )}
                <span
                  className="relative inline-flex h-2 w-2 rounded-full"
                  style={{ backgroundColor: status.color }}
                />
              </span>
              <span
                className="font-mono text-[10px] uppercase tracking-[0.2em] transition-colors"
                style={{ color: status.color }}
              >
                {status.text}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <Terminal className="h-3.5 w-3.5 text-ink-faint" />
          <span className="font-mono text-[10px] uppercase tracking-wider text-ink-dim">
            SSE Bridge
          </span>
        </div>
      </div>

      {/* ────────── PANEL ────────── */}
      <div className="relative overflow-hidden rounded-2xl border border-line/[0.06] bg-surface-lowest font-mono">
        {/* Title bar */}
        <div className="flex items-center justify-between border-b border-line/[0.06] bg-surface-card px-6 py-4">
          <div className="flex items-center gap-3">
            <Terminal className="h-3.5 w-3.5 text-ink-faint" />
            <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-ink">
              Telemetry_Log
            </span>
          </div>
          {/* Remounting on the value — not the list length, which is capped —
              is what makes the flash fire for the life of the project. */}
          <span
            key={total}
            className="pkt-flash font-mono text-[10px] tabular-nums text-ink-dim"
            title="Total events recorded for this project"
          >
            {total.toLocaleString()} PKTS_RECEIVED
          </span>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 border-b border-line/[0.06] px-6 py-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <ToneChip
              active={tone === "all"}
              onClick={() => setTone("all")}
              label="All"
              count={events.length}
            />
            {TONE_ORDER.map((t) =>
              toneCounts[t] > 0 ? (
                <ToneChip
                  key={t}
                  active={tone === t}
                  onClick={() => setTone(tone === t ? "all" : t)}
                  label={TONE_LABEL[t]}
                  count={toneCounts[t]}
                  color={TONE_COLOR[t]}
                />
              ) : null
            )}
          </div>

          <div className="ml-auto flex items-center gap-2 rounded-lg border border-line/[0.06] bg-surface-card px-2.5 py-1.5 focus-within:border-line/[0.12]">
            <Search className="h-3 w-3 shrink-0 text-ink-faint" aria-hidden />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by name, file, actor…"
              aria-label="Filter telemetry log"
              className="w-44 bg-transparent font-mono text-[10px] text-ink placeholder:text-ink-faint focus:outline-none sm:w-56"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear filter"
                className="text-ink-faint transition-colors hover:text-ink"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>

        {/* Paused pill */}
        {!following && pending > 0 && (
          <button
            type="button"
            onClick={jumpToLive}
            className="stream-in absolute left-1/2 top-[112px] z-30 -translate-x-1/2 rounded-full border border-line/[0.06] bg-surface-lowest/95 px-4 py-1.5 shadow-[0_0_20px_rgb(var(--scrim)_/_0.8)] backdrop-blur-md transition-colors hover:border-line/[0.12]"
          >
            <span className="flex items-center gap-2">
              <ArrowUp className="h-3 w-3 animate-bounce text-orbit-amber" aria-hidden />
              <span className="font-mono text-[10px] uppercase tracking-wider tabular-nums text-ink">
                {pending} new update{pending !== 1 ? "s" : ""}
              </span>
            </span>
          </button>
        )}

        <div className="relative">
          {/* Bottom scrim only. A top scrim would permanently half-fade the
              newest row, which in a newest-first log is the one row that
              must never be dimmed. */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-16 bg-gradient-to-t from-surface-lowest to-transparent" />

          <div
            ref={feedRef}
            onScroll={handleScroll}
            role="log"
            aria-live={following && !error ? "polite" : "off"}
            aria-relevant="additions"
            aria-busy={loading}
            className="custom-scrollbar relative max-h-[520px] overflow-y-auto px-5 py-4"
          >
            {loading ? (
              <div className="space-y-4 py-2 opacity-20" aria-hidden>
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-4 w-full animate-pulse rounded bg-surface-control" />
                ))}
              </div>
            ) : error ? (
              <EmptyState
                icon={AlertTriangle}
                tone={SIGNAL.red}
                title="Stream interrupted"
                detail={error}
              />
            ) : events.length === 0 ? (
              <EmptyState
                icon={Terminal}
                title="No signal detected"
                detail="Activity appears here the moment work starts on this project."
              />
            ) : visible.length === 0 ? (
              <EmptyState
                icon={Search}
                title="No matching events"
                detail={`Nothing in the last ${events.length} events matches this filter.`}
                action={
                  <button
                    type="button"
                    onClick={() => {
                      setTone("all");
                      setQuery("");
                    }}
                    className="mt-4 rounded-lg border border-line/[0.08] px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-ink-muted transition-colors hover:border-line/20 hover:text-ink"
                  >
                    Clear filters
                  </button>
                }
              />
            ) : (
              <div className="pb-10">
                {groups.map((group) => (
                  <div key={group.key}>
                    <div className="sticky top-0 z-10 -mx-5 flex items-center gap-3 bg-surface-lowest/95 px-5 py-2 backdrop-blur-sm">
                      <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-ink-dim">
                        {group.label}
                      </span>
                      <span className="h-px flex-1 bg-surface-control" />
                      <span className="font-mono text-[9px] tabular-nums text-ink-faint">
                        {group.rows.length}
                      </span>
                    </div>

                    <div className="space-y-0.5 py-1">
                      {group.rows.map((event) => (
                        <LogRow key={event.id} event={event} isNew={isNew(event.id)} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ────────── FOOTER ────────── */}
        <div className="flex items-center justify-between border-t border-line/[0.06] bg-surface-card px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="relative flex h-2 w-2">
              {!error && (
                <span
                  className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-40"
                  style={{ backgroundColor: status.color }}
                />
              )}
              <span
                className="relative inline-flex h-2 w-2 rounded-full"
                style={{ backgroundColor: status.color }}
              />
            </span>
            <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-ink-dim">
              System Status:{" "}
              <span style={{ color: status.color }} className="transition-colors duration-300">
                {status.label}
              </span>
            </span>
          </div>

          <span className="font-mono text-[9px] uppercase tracking-widest tabular-nums text-ink-dim">
            {filtered ? (
              <>
                Showing {visible.length} of {events.length}
              </>
            ) : (
              <>Orbit_Telemetry_v4.1</>
            )}
          </span>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Toolbar chip                                                       */
/* ------------------------------------------------------------------ */

function ToneChip({
  active,
  onClick,
  label,
  count,
  color,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  color?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.15em] transition-colors",
        active
          ? "border-line/[0.14] bg-surface-control text-ink"
          : "border-line/[0.06] text-ink-dim hover:border-line/[0.1] hover:text-ink-muted"
      )}
    >
      {color && (
        <span
          aria-hidden
          className="h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: color, opacity: active ? 1 : 0.55 }}
        />
      )}
      {label}
      <span className="tabular-nums text-ink-faint">{count}</span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Empty / error states                                               */
/* ------------------------------------------------------------------ */

function EmptyState({
  icon: Icon,
  title,
  detail,
  tone,
  action,
}: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  title: string;
  detail: string;
  tone?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
      <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-card ring-1 ring-line/[0.06]">
        <Icon className="h-5 w-5 text-ink-faint" style={tone ? { color: tone } : undefined} />
      </div>
      <p className="mb-1.5 font-mono text-[12px] uppercase tracking-widest text-ink">{title}</p>
      <p className="max-w-xs font-mono text-[10px] leading-relaxed text-ink-dim">{detail}</p>
      {action}
    </div>
  );
}
