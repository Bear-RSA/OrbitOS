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
     is honoured — someone heads-down may not want to look reachable. */
  const stated = facts.operationalStatus?.toLowerCase();
  if (stated === "offline") return "offline";
  if (stated === "focused") return "focused";
  return "available";
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
