/* ------------------------------------------------------------------ */
/*  Availability                                                       */
/*                                                                     */
/*  Raw free/busy is not a feature. Inverting busy time produces slots */
/*  that are technically open and socially useless — eleven minutes    */
/*  wedged between two calls, or 06:00 on a Sunday. What makes a slot  */
/*  offerable is the filter chain applied on top: working hours, a     */
/*  buffer either side of existing commitments, and a minimum notice   */
/*  so nothing is proposed for four minutes from now.                  */
/*                                                                     */
/*  Everything here is pure and works in local time, because working   */
/*  hours are a human schedule rather than a UTC one.                  */
/* ------------------------------------------------------------------ */

export interface TimeRange {
  start: Date;
  end: Date;
}

export interface WorkingHours {
  /** Days the studio operates. 0 = Sunday … 6 = Saturday. */
  days: number[];
  /** Minutes from local midnight. */
  startMinute: number;
  endMinute: number;
}

/**
 * Assumed studio hours: weekdays, 08:00–17:00 local.
 *
 * Hardcoded rather than configurable for now. Everything below takes an
 * override, so making this a per-workspace preference later is a wiring
 * change, not a rewrite.
 */
export const DEFAULT_WORKING_HOURS: WorkingHours = {
  days: [1, 2, 3, 4, 5],
  startMinute: 8 * 60,
  endMinute: 17 * 60,
};

export interface SlotConstraints {
  /** Length of the engagement being placed. */
  durationMins: number;
  /** Clear space kept either side of an existing commitment. */
  bufferMins?: number;
  /** Nothing is offered sooner than this from now. */
  minimumNoticeMins?: number;
  /** Proposed starts snap to this grid, measured from local midnight. */
  granularityMins?: number;
  workingHours?: WorkingHours;
  /** Stop after this many proposals. */
  limit?: number;
  /** Injected in tests; defaults to the wall clock. */
  now?: Date;
}

const MINUTE_MS = 60_000;

/* ------------------------------------------------------------------ */
/*  Range algebra                                                      */
/* ------------------------------------------------------------------ */

/** Collapses overlapping and touching ranges into a clean timeline. */
export function mergeRanges(ranges: TimeRange[]): TimeRange[] {
  const sorted = [...ranges]
    .filter((r) => r.end > r.start)
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  const merged: TimeRange[] = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (last && range.start.getTime() <= last.end.getTime()) {
      if (range.end > last.end) last.end = new Date(range.end);
    } else {
      merged.push({ start: new Date(range.start), end: new Date(range.end) });
    }
  }
  return merged;
}

/** Grows every range outward, so a buffer is honoured on both sides. */
export function padRanges(ranges: TimeRange[], minutes: number): TimeRange[] {
  if (minutes <= 0) return ranges.map((r) => ({ ...r }));
  return ranges.map((r) => ({
    start: new Date(r.start.getTime() - minutes * MINUTE_MS),
    end: new Date(r.end.getTime() + minutes * MINUTE_MS),
  }));
}

/** The parts of `within` that `busy` does not cover. */
export function invertRanges(busy: TimeRange[], within: TimeRange): TimeRange[] {
  const free: TimeRange[] = [];
  let cursor = within.start;

  for (const block of mergeRanges(busy)) {
    if (block.end <= within.start) continue;
    if (block.start >= within.end) break;

    if (block.start > cursor) {
      free.push({ start: new Date(cursor), end: new Date(block.start) });
    }
    if (block.end > cursor) cursor = block.end;
  }

  if (cursor < within.end) {
    free.push({ start: new Date(cursor), end: new Date(within.end) });
  }
  return free;
}

/**
 * The working-hour windows falling inside [from, to], one per operating
 * day, clipped to the requested bounds.
 */
export function workingWindows(
  from: Date,
  to: Date,
  hours: WorkingHours = DEFAULT_WORKING_HOURS
): TimeRange[] {
  const windows: TimeRange[] = [];
  if (hours.endMinute <= hours.startMinute) return windows;

  // Walk calendar days in local time, starting at the day `from` lands in.
  const day = new Date(from.getFullYear(), from.getMonth(), from.getDate());

  while (day <= to) {
    if (hours.days.includes(day.getDay())) {
      const open = new Date(day);
      open.setMinutes(hours.startMinute);
      const close = new Date(day);
      close.setMinutes(hours.endMinute);

      const start = open < from ? from : open;
      const end = close > to ? to : close;
      if (end > start) windows.push({ start, end });
    }
    day.setDate(day.getDate() + 1);
  }

  return windows;
}

/* ------------------------------------------------------------------ */
/*  Slot proposal                                                      */
/* ------------------------------------------------------------------ */

/** Rounds a time up to the next point on the granularity grid. */
function snapUp(date: Date, granularityMins: number): Date {
  if (granularityMins <= 1) return new Date(date);
  const snapped = new Date(date);
  snapped.setSeconds(0, 0);
  const minutes = snapped.getHours() * 60 + snapped.getMinutes();
  const remainder = minutes % granularityMins;
  if (remainder !== 0 || snapped.getTime() < date.getTime()) {
    snapped.setMinutes(snapped.getMinutes() + (granularityMins - remainder));
  }
  return snapped;
}

/**
 * Offerable start times for an engagement of `durationMins`, given what
 * the attendees are already committed to.
 *
 * `busy` is the union across everyone who has to be there — a slot is
 * only offerable when it is free for all of them.
 */
export function findSlots(
  busy: TimeRange[],
  within: TimeRange,
  constraints: SlotConstraints
): TimeRange[] {
  const {
    durationMins,
    bufferMins = 0,
    minimumNoticeMins = 0,
    granularityMins = 15,
    workingHours = DEFAULT_WORKING_HOURS,
    limit = 12,
    now = new Date(),
  } = constraints;

  if (durationMins <= 0) return [];

  // Nothing before the notice horizon is worth proposing.
  const earliest = new Date(
    Math.max(within.start.getTime(), now.getTime() + minimumNoticeMins * MINUTE_MS)
  );
  if (earliest >= within.end) return [];

  const padded = padRanges(busy, bufferMins);
  const slots: TimeRange[] = [];

  for (const window of workingWindows(earliest, within.end, workingHours)) {
    for (const free of invertRanges(padded, window)) {
      let cursor = snapUp(free.start, granularityMins);

      while (cursor.getTime() + durationMins * MINUTE_MS <= free.end.getTime()) {
        slots.push({
          start: new Date(cursor),
          end: new Date(cursor.getTime() + durationMins * MINUTE_MS),
        });
        if (slots.length >= limit) return slots;
        cursor = new Date(cursor.getTime() + granularityMins * MINUTE_MS);
      }
    }
  }

  return slots;
}

/** True when [start, end) collides with any busy range. */
export function overlapsBusy(start: Date, end: Date, busy: TimeRange[]): boolean {
  return busy.some((block) => block.start < end && block.end > start);
}
