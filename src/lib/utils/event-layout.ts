/* ------------------------------------------------------------------ */
/*  Timed-lane collision layout                                        */
/*                                                                     */
/*  Solves the horizontal half of placing engagements on a day column. */
/*  Vertical position falls straight out of the day window, so it is   */
/*  left to the renderer; only overlap needs an algorithm.             */
/*                                                                     */
/*  Three constraints, the same ones Google Calendar honours:          */
/*    1. Colliding blocks never visually overlap.                      */
/*    2. Every block in a collision cluster shares one width.          */
/*    3. A block takes the widest slot the first two rules allow, so   */
/*       one with nothing to its right expands into that space.        */
/* ------------------------------------------------------------------ */

export interface LayoutInput {
  id: string;
  startMs: number;
  endMs: number;
}

export interface LayoutBox {
  /** Fraction of the column, 0–1. */
  left: number;
  /** Fraction of the column, 0–1. */
  width: number;
}

/**
 * Positions overlapping items side by side within a single day column.
 * Returns a map of id → horizontal box; ids absent from the input are
 * absent from the result.
 */
export function layoutCollisions(items: LayoutInput[]): Map<string, LayoutBox> {
  const boxes = new Map<string, LayoutBox>();
  if (items.length === 0) return boxes;

  /* Longest-first on equal starts keeps the big block on the left, which
     reads better than letting a short one claim the first column. */
  const sorted = [...items].sort(
    (a, b) => a.startMs - b.startMs || b.endMs - a.endMs
  );

  let cluster: LayoutInput[] = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    if (cluster.length > 0) placeCluster(cluster, boxes);
    cluster = [];
    clusterEnd = -Infinity;
  };

  for (const item of sorted) {
    // A gap with nothing running through it ends the cluster: what comes
    // next cannot collide with anything before it.
    if (item.startMs >= clusterEnd) flush();
    cluster.push(item);
    clusterEnd = Math.max(clusterEnd, item.endMs);
  }
  flush();

  return boxes;
}

/** Assigns columns within one cluster, then widens what it can. */
function placeCluster(cluster: LayoutInput[], boxes: Map<string, LayoutBox>) {
  // columns[i] holds the items packed into column i, in time order.
  const columns: LayoutInput[][] = [];

  for (const item of cluster) {
    // Leftmost column whose occupant has already finished.
    const target = columns.find((col) => col[col.length - 1].endMs <= item.startMs);
    if (target) target.push(item);
    else columns.push([item]);
  }

  const total = columns.length;
  const unit = 1 / total;

  columns.forEach((col, index) => {
    for (const item of col) {
      /* Widen rightwards while the neighbouring column holds nothing that
         overlaps this item's span — constraint 3. */
      let span = 1;
      for (let next = index + 1; next < total; next++) {
        const blocked = columns[next].some(
          (other) => other.startMs < item.endMs && other.endMs > item.startMs
        );
        if (blocked) break;
        span++;
      }

      boxes.set(item.id, {
        left: index * unit,
        width: span * unit,
      });
    }
  });
}

/* ------------------------------------------------------------------ */
/*  Day window                                                         */
/* ------------------------------------------------------------------ */

/** Hours the grid always shows, even on an empty week. */
const DEFAULT_START_HOUR = 7;
const DEFAULT_END_HOUR = 19;

export interface DayWindow {
  startHour: number;
  endHour: number;
}

/**
 * The hour range the timed lane should render: the working day, widened
 * to fit anything scheduled outside it, so an 06:00 call is never
 * clipped and a quiet week never renders a wall of empty night.
 */
export function dayWindowFor(items: LayoutInput[]): DayWindow {
  let startHour = DEFAULT_START_HOUR;
  let endHour = DEFAULT_END_HOUR;

  for (const item of items) {
    const start = new Date(item.startMs);
    const end = new Date(item.endMs);

    startHour = Math.min(startHour, start.getHours());
    // Round the end up so a 17:30 finish does not sit on the boundary.
    const endsAt = end.getHours() + (end.getMinutes() > 0 ? 1 : 0);
    endHour = Math.max(endHour, endsAt);
  }

  return {
    startHour: Math.max(0, startHour),
    endHour: Math.min(24, Math.max(endHour, startHour + 1)),
  };
}
