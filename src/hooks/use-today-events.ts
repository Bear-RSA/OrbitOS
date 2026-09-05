"use client";

import { useEffect, useState } from "react";
import { OrbitEvent } from "@/types/event";
import { getEventsInRange } from "@/lib/queries/events";

/* ------------------------------------------------------------------ */
/*  Today's engagements, fetched once                                  */
/*                                                                     */
/*  Two dashboard cards need the same range: the schedule lists it,    */
/*  and presence reads it to tell whether someone is in a room right   */
/*  now. Fetching inside each card would issue the identical query     */
/*  twice on every load and every refresh, so the dashboard calls this */
/*  once and hands the result to both.                                 */
/* ------------------------------------------------------------------ */

export interface TodayEventsState {
  /** Null until the first read resolves. */
  events: OrbitEvent[] | null;
  /** The read was refused or failed. `events` is [] so callers can render. */
  failed: boolean;
}

export function useTodayEvents(orgId: string, refreshKey = 0): TodayEventsState {
  const [state, setState] = useState<TodayEventsState>({ events: null, failed: false });

  useEffect(() => {
    let cancelled = false;

    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    setState({ events: null, failed: false });

    getEventsInRange(orgId, start, end)
      .then((events) => {
        if (!cancelled) setState({ events, failed: false });
      })
      .catch((err) => {
        // Most likely the (orgId, startAt) composite index, or a signed-out
        // read. These are two cards, not the page — let the rest render.
        console.error("[useTodayEvents] range query failed", err);
        if (!cancelled) setState({ events: [], failed: true });
      });

    return () => {
      cancelled = true;
    };
  }, [orgId, refreshKey]);

  return state;
}
