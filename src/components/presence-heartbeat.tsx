"use client";

import { useAuth } from "@/contexts/auth-context";
import { useHeartbeat } from "@/hooks/use-heartbeat";

/** Renders nothing. Keeps the signed-in person's presence alive on every page. */
export function PresenceHeartbeat() {
  const { user } = useAuth();
  useHeartbeat(user?.id);
  return null;
}
