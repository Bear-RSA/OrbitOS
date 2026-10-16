/* ------------------------------------------------------------------ */
/*  Presence                                                           */
/*                                                                     */
/*  Whether somebody is actually there, from the heartbeat rather than */
/*  from what they last told us.                                       */
/*                                                                     */
/*  `operationalStatus` is a stored, self-set field. It does not decay: */
/*  a person who marked themselves available on Tuesday and shut the   */
/*  laptop still reads "available" on Friday. `lastActivity` is the    */
/*  one that expires on its own, because `useHeartbeat` only writes it */
/*  while a tab is genuinely open.                                     */
/*                                                                     */
/*  So the heartbeat decides whether the stored status is worth        */
/*  believing at all, and the stored status only colours the answer    */
/*  once the heartbeat has vouched for it.                             */
/* ------------------------------------------------------------------ */

export type Presence = "available" | "focused" | "offline";

/**
 * How long a heartbeat is trusted after it lands.
 *
 * `useHeartbeat` pulses every 3 minutes, so one missed pulse — a
 * suspended tab, a dropped request, a slow write — does not put someone
 * offline, and two do. Tightening this below the pulse interval would
 * make everybody flicker.
 */
export const PRESENCE_STALE_AFTER_MS = 5 * 60_000;

export interface PresenceFacts {
  /** The self-set field from the user document. */
  operationalStatus?: string | null;
  /** `lastActivity` in millis, or null when the field is absent. */
  lastActivityMs?: number | null;
  /** True when the person picked their status in Settings themselves. */
  manualOverride?: boolean | null;
}

/**
 * What to show for this person right now.
 *
 * NO HEARTBEAT MEANS OFFLINE. That is the case worth stating plainly:
 * a member who has never had a pulse written — someone invited but not
 * yet arrived, or an account from before heartbeats existed — has never
 * been observed present, and "we have no evidence of them" must not
 * render as a green dot saying they are here.
 */
export function resolvePresence(
  facts: PresenceFacts,
  now: number = Date.now()
): Presence {
  const beat = facts.lastActivityMs;
  if (!beat) return "offline";
  if (now - beat > PRESENCE_STALE_AFTER_MS) return "offline";

  /* The heartbeat vouches for them being here; the stored status says
     how they want to be treated while they are. A deliberate "offline"
     is honoured — someone heads-down may not want to look reachable.
     Only a deliberate one, though: the status engine used to write
     "offline" itself when a heartbeat went quiet, and that leftover must
     not hide someone who has since come back. */
  const stated = facts.operationalStatus?.toLowerCase();
  if (stated === "offline") return facts.manualOverride ? "offline" : "available";
  if (stated === "focused") return "focused";
  return "available";
}

/** `resolvePresence` straight from a member document. */
export function presenceOfMember(
  member: {
    operationalStatus?: string | null;
    manualOverride?: boolean | null;
    lastActivity?: { toMillis?: () => number } | null;
  },
  now: number = Date.now()
): Presence {
  return resolvePresence(
    {
      operationalStatus: member.operationalStatus,
      manualOverride: member.manualOverride,
      lastActivityMs: member.lastActivity?.toMillis?.() ?? null,
    },
    now
  );
}

/** What the dot means, for its tooltip and screen readers. */
export function presenceLabel(presence: Presence): string {
  switch (presence) {
    case "offline":
      return "Offline";
    case "focused":
      return "Online, focused";
    default:
      return "Online";
  }
}

/**
 * The words beside a dot: "Online", or when they were last here.
 *
 * Someone who set themselves Offline gets "Offline" and no time — the
 * point of choosing it is not to be watched.
 */
export function presenceLine(
  member: Parameters<typeof presenceOfMember>[0],
  now: number = Date.now()
): string {
  const presence = presenceOfMember(member, now);
  if (presence !== "offline") return presenceLabel(presence);

  const beat = member.lastActivity?.toMillis?.();
  const chosen = member.manualOverride && member.operationalStatus === "offline";
  if (!beat || chosen) return "Offline";

  const minutes = Math.max(1, Math.round((now - beat) / 60_000));
  if (minutes < 60) return `Last seen ${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Last seen ${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "Last seen yesterday" : `Last seen ${days} days ago`;
}

/** The dot colour, so every surface showing presence shows one colour. */
export function presenceTone(presence: Presence): string {
  switch (presence) {
    case "offline":
      return "bg-ink-faint";
    case "focused":
      return "bg-orbit-amber";
    default:
      return "bg-orbit-green";
  }
}
