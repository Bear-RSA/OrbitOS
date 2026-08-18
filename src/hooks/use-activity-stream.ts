"use client";

import { useCallback, useSyncExternalStore } from "react";

/* ------------------------------------------------------------------ */
/*  SSE Activity Stream Hook                                           */
/*                                                                     */
/*  Connects to /api/telemetry/stream via EventSource. Because that is */
/*  a first-party request to our own origin, ad blockers and browser   */
/*  shields leave it alone — which is why the feed goes through our    */
/*  own route instead of the Firestore web SDK.                        */
/*                                                                     */
/*  Connections are SHARED per projectId and reference-counted. The    */
/*  project page mounts both CommandCenter and ProjectPulse against    */
/*  the same feed; without sharing, that is two EventSources, two      */
/*  server-side Firestore listeners, and two copies of every payload   */
/*  for one page view.                                                 */
/* ------------------------------------------------------------------ */

export interface SSEActivityEvent {
  id: string;
  eventType: string;
  projectId: string | null;
  orgId: string;
  actor: {
    uid: string;
    name: string;
  };
  metadata: Record<string, any>;
  timestamp: string | null; // ISO string from the server
}

export interface ActivityStreamState {
  /** Newest first. Sorted once here so consumers never re-sort per render. */
  events: SSEActivityEvent[];
  /** Lifetime event count for the project, from the server's aggregate. */
  total: number;
  loading: boolean;
  connected: boolean;
  error: string | null;
}

/** Client-side memory ceiling. The server window is smaller; this only
 *  matters for a long-lived session accumulating appends. */
const MAX_EVENTS = 250;

/** Retry schedule: exponential with jitter, so a server-side outage does
 *  not turn every open tab into a synchronised 3-second retry drum. */
const BASE_RETRY_MS = 1_000;
const MAX_RETRY_MS = 30_000;

/** EventSource cannot see the HTTP status behind a failed connect, so a 401
 *  or 403 is indistinguishable from a dropped socket. Give up after this
 *  many attempts if we have NEVER successfully connected — a genuine
 *  permission failure will never succeed, and retrying it forever is a
 *  request loop with no possible outcome. */
const MAX_COLD_ATTEMPTS = 5;

const EMPTY_STATE: ActivityStreamState = {
  events: [],
  total: 0,
  loading: true,
  connected: false,
  error: null,
};

/** Returned when the stream is disabled or rendering on the server. Kept as
 *  a module constant because useSyncExternalStore requires getSnapshot to
 *  return a referentially stable value between updates. */
const IDLE_STATE: ActivityStreamState = { ...EMPTY_STATE, loading: false };

/* ------------------------------------------------------------------ */
/*  Shared per-project connection                                      */
/* ------------------------------------------------------------------ */

interface Connection {
  state: ActivityStreamState;
  subscribers: Set<() => void>;
  refs: number;
  source: EventSource | null;
  retryTimer: ReturnType<typeof setTimeout> | null;
  attempts: number;
  everConnected: boolean;
  onVisibility: (() => void) | null;
}

const connections = new Map<string, Connection>();

const byNewest = (a: SSEActivityEvent, b: SSEActivityEvent) => {
  // A missing timestamp means the server write has not resolved yet. Treat
  // it as "now" rather than epoch 0, so a pending event sorts to the top
  // where it belongs instead of sinking to the bottom of the log.
  const ta = a.timestamp ? new Date(a.timestamp).getTime() : Date.now();
  const tb = b.timestamp ? new Date(b.timestamp).getTime() : Date.now();
  return tb - ta;
};

function update(conn: Connection, patch: Partial<ActivityStreamState>) {
  conn.state = { ...conn.state, ...patch };
  conn.subscribers.forEach((notify) => notify());
}

/** Merges incoming events into the list, replacing any existing entry with
 *  the same id (a `modified` delta) rather than duplicating it. */
function merge(existing: SSEActivityEvent[], incoming: SSEActivityEvent[]) {
  const byId = new Map(existing.map((e) => [e.id, e]));
  incoming.forEach((e) => byId.set(e.id, e));
  return Array.from(byId.values()).sort(byNewest).slice(0, MAX_EVENTS);
}

function scheduleRetry(projectId: string, conn: Connection) {
  if (conn.retryTimer) return;

  if (!conn.everConnected && conn.attempts >= MAX_COLD_ATTEMPTS) {
    update(conn, {
      loading: false,
      connected: false,
      error: "Telemetry unavailable — the feed could not be authorised.",
    });
    return;
  }

  const backoff = Math.min(BASE_RETRY_MS * 2 ** conn.attempts, MAX_RETRY_MS);
  const jitter = backoff * (0.7 + Math.random() * 0.6);
  conn.attempts += 1;

  conn.retryTimer = setTimeout(() => {
    conn.retryTimer = null;
    open(projectId, conn);
  }, jitter);
}

function open(projectId: string, conn: Connection) {
  // A connection whose last subscriber left while a retry was pending.
  if (conn.refs === 0) return;

  conn.source?.close();

  const source = new EventSource(
    `/api/telemetry/stream?projectId=${encodeURIComponent(projectId)}`
  );
  conn.source = source;

  source.onmessage = (event) => {
    let payload: any;
    try {
      payload = JSON.parse(event.data);
    } catch {
      console.error("[SSE] Unparseable frame:", event.data);
      return;
    }

    switch (payload.type) {
      case "ready":
        conn.everConnected = true;
        conn.attempts = 0;
        update(conn, { connected: true, error: null, total: payload.total ?? 0 });
        break;

      case "snapshot":
        update(conn, {
          events: merge([], payload.events ?? []),
          loading: false,
          connected: true,
        });
        break;

      case "append":
        update(conn, {
          events: merge(conn.state.events, payload.events ?? []),
          total: payload.total ?? conn.state.total,
          loading: false,
        });
        break;

      case "error":
        update(conn, { error: payload.message, connected: false });
        break;
    }
  };

  source.onerror = () => {
    source.close();
    // A late error from a source we have already replaced must not clear the
    // live one, or the retry path would tear down a working connection.
    if (conn.source !== source) return;
    conn.source = null;
    update(conn, { connected: false });
    scheduleRetry(projectId, conn);
  };
}

function acquire(projectId: string): Connection {
  let conn = connections.get(projectId);

  if (!conn) {
    conn = {
      state: EMPTY_STATE,
      subscribers: new Set(),
      refs: 0,
      source: null,
      retryTimer: null,
      attempts: 0,
      everConnected: false,
      onVisibility: null,
    };
    connections.set(projectId, conn);
  }

  conn.refs += 1;

  if (conn.refs === 1) {
    open(projectId, conn);

    // Browsers throttle and often drop connections for background tabs.
    // Reconnecting the moment the tab is looked at again means the user
    // never sees a stale "Reconnecting" state on a feed they just returned
    // to, instead of waiting out whatever backoff step we were on.
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      if (conn!.source || conn!.refs === 0) return;
      if (conn!.retryTimer) {
        clearTimeout(conn!.retryTimer);
        conn!.retryTimer = null;
      }
      conn!.attempts = 0;
      open(projectId, conn!);
    };
    document.addEventListener("visibilitychange", onVisibility);
    conn.onVisibility = onVisibility;
  }

  return conn;
}

function release(projectId: string) {
  const conn = connections.get(projectId);
  if (!conn) return;

  conn.refs -= 1;
  if (conn.refs > 0) return;

  conn.source?.close();
  conn.source = null;
  if (conn.retryTimer) clearTimeout(conn.retryTimer);
  conn.retryTimer = null;
  if (conn.onVisibility) {
    document.removeEventListener("visibilitychange", conn.onVisibility);
    conn.onVisibility = null;
  }
  connections.delete(projectId);
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

interface UseActivityStreamOptions {
  projectId: string;
  enabled?: boolean;
}

export function useActivityStream({
  projectId,
  enabled = true,
}: UseActivityStreamOptions): ActivityStreamState {
  const active = enabled && Boolean(projectId);

  // `subscribe` doubles as the lifecycle owner: React calls it on mount and
  // runs its teardown on unmount, which is exactly the shape reference
  // counting needs. Nothing else may acquire or release.
  const subscribe = useCallback(
    (notify: () => void) => {
      if (!active) return () => {};

      const conn = acquire(projectId);
      conn.subscribers.add(notify);

      return () => {
        conn.subscribers.delete(notify);
        release(projectId);
      };
    },
    [projectId, active]
  );

  const getSnapshot = useCallback(
    () => (active ? connections.get(projectId)?.state ?? EMPTY_STATE : IDLE_STATE),
    [projectId, active]
  );

  // No EventSource on the server: render the idle state and let the client
  // take over on hydration.
  const getServerSnapshot = useCallback(() => IDLE_STATE, []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
