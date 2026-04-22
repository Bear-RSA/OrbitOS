"use client";

import { useState, useEffect, useRef, useCallback } from "react";

/* ------------------------------------------------------------------ */
/*  SSE Activity Stream Hook                                           */
/*                                                                     */
/*  Connects to /api/telemetry/stream via EventSource (SSE).           */
/*  The browser treats this as a first-party request to your own       */
/*  domain, so AdBlockers and Shields cannot intercept it.             */
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
  timestamp: string | null; // ISO string from server
}

interface UseActivityStreamOptions {
  projectId: string;
  enabled?: boolean;
}

interface UseActivityStreamReturn {
  events: SSEActivityEvent[];
  loading: boolean;
  connected: boolean;
  error: string | null;
}

export function useActivityStream({
  projectId,
  enabled = true,
}: UseActivityStreamOptions): UseActivityStreamReturn {
  const [events, setEvents] = useState<SSEActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const cleanup = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!enabled || !projectId) {
      setLoading(false);
      return;
    }

    const connect = () => {
      cleanup();

      const url = `/api/telemetry/stream?projectId=${encodeURIComponent(projectId)}`;
      const es = new EventSource(url);
      eventSourceRef.current = es;

      es.onopen = () => {
        console.log("[SSE] Connection established for project:", projectId);
        setConnected(true);
        setError(null);
      };

      es.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);

          if (payload.type === "connected") {
            console.log("[SSE] Server confirmed connection for:", payload.projectId);
            return;
          }

          if (payload.type === "error") {
            console.error("[SSE] Server error:", payload.message);
            setError(payload.message);
            return;
          }

          if (payload.type === "snapshot" && Array.isArray(payload.events)) {
            setEvents(payload.events);
            setLoading(false);
          }
        } catch (err) {
          console.error("[SSE] Failed to parse message:", err);
        }
      };

      es.onerror = () => {
        console.warn("[SSE] Connection lost. Reconnecting in 3s...");
        setConnected(false);
        es.close();
        eventSourceRef.current = null;

        // Auto-reconnect after 3 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          console.log("[SSE] Attempting reconnection...");
          connect();
        }, 3000);
      };
    };

    connect();

    return () => {
      cleanup();
      setConnected(false);
    };
  }, [projectId, enabled, cleanup]);

  return { events, loading, connected, error };
}
