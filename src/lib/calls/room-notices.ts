/* ------------------------------------------------------------------ */
/*  Room notices                                                       */
/*                                                                     */
/*  What a call tells you about itself while you are not watching it.  */
/*  Somebody walking into the room, somebody walking out, a line typed */
/*  into the room's chat — three things the provider paints inside its */
/*  own frame, which is exactly the frame a person cannot see while    */
/*  the call is parked in the corner or the tab is behind another.     */
/*                                                                     */
/*  This file is the pure half: it decides WHAT counts as an arrival   */
/*  and what a chat message looks like, and it says nothing about the  */
/*  DOM. The subscribing, the timers and the rendering live in         */
/*  `hooks/use-room-notices` and `components/calls/room-notices`.      */
/*                                                                     */
/*  THE ROSTER IS THE POINT. The provider fires `participant-joined`   */
/*  for people who were already in the room when you arrived, and a    */
/*  person walking into a meeting of eight does not want eight cards   */
/*  saying so. So nothing is announced until the local participant has */
/*  actually joined, and the people present at that moment are taken   */
/*  as read.                                                           */
/* ------------------------------------------------------------------ */

export type RoomNoticeKind = "joined" | "left" | "chat";

export interface RoomNotice {
  id: string;
  kind: RoomNoticeKind;
  /** Who it is about, as the provider knows them. */
  name: string;
  /** The message itself. Only chat carries one. */
  text?: string;
  /** Epoch ms, for expiry. */
  at: number;
}

/** How long a notice stays on screen before it withdraws itself. */
export const NOTICE_TTL_MS = 6_000;

/** The most notices shown at once. Older ones make room for newer. */
export const MAX_VISIBLE_NOTICES = 3;

/** What to call somebody the provider has no name for. */
export const UNNAMED_PARTICIPANT = "Someone";

/* ------------------------------------------------------------------ */
/*  Roster                                                             */
/* ------------------------------------------------------------------ */

/**
 * Who is known to be in the room, by provider session id.
 *
 * `settled` flips once the local participant is in. Before that, every
 * event is the provider catching us up on a room that was already
 * running, and none of it is news.
 */
export interface RoomRoster {
  settled: boolean;
  present: Set<string>;
}

export function emptyRoster(): RoomRoster {
  return { settled: false, present: new Set() };
}

/**
 * Called once the local participant has joined, with everyone already
 * there. From here on, arrivals and departures are real.
 */
export function settleRoster(roster: RoomRoster, presentIds: Iterable<string>): RoomRoster {
  return { settled: true, present: new Set(presentIds) };
}

/**
 * Records an arrival. True when it is worth announcing: the roster has
 * settled and this is somebody not already counted.
 */
export function noteArrival(roster: RoomRoster, sessionId: string): boolean {
  if (!roster.settled) return false;
  if (roster.present.has(sessionId)) return false;
  roster.present.add(sessionId);
  return true;
}

/**
 * Records a departure. True when it is worth announcing: the roster has
 * settled and this is somebody who was counted as present.
 */
export function noteDeparture(roster: RoomRoster, sessionId: string): boolean {
  if (!roster.settled) return false;
  return roster.present.delete(sessionId);
}

/* ------------------------------------------------------------------ */
/*  Chat                                                               */
/* ------------------------------------------------------------------ */

export interface RoomChatMessage {
  /** Absent when the payload carried no name; the caller looks one up. */
  name: string | null;
  message: string;
}

/**
 * Reads a chat line out of a provider app-message, if that is what it
 * is.
 *
 * Daily Prebuilt sends its chat over the same `app-message` channel
 * anything else could use, marked `event: "chat-msg"`. Anything not so
 * marked — a custom message, a malformed one, a future Prebuilt
 * payload — reads as "not chat" rather than as a chat line with no
 * words in it.
 */
export function readChatMessage(data: unknown): RoomChatMessage | null {
  if (!data || typeof data !== "object") return null;

  const payload = data as Record<string, unknown>;
  if (payload.event !== "chat-msg") return null;
  if (typeof payload.message !== "string") return null;

  const message = payload.message.trim();
  if (!message) return null;

  const name =
    typeof payload.name === "string" && payload.name.trim() ? payload.name.trim() : null;

  return { name, message };
}

/* ------------------------------------------------------------------ */
/*  Wording                                                            */
/* ------------------------------------------------------------------ */

/** What the notice says, in-app and on the desktop alike. */
export function noticeText(notice: Pick<RoomNotice, "kind" | "name" | "text">): string {
  switch (notice.kind) {
    case "joined":
      return `${notice.name} joined`;
    case "left":
      return `${notice.name} left`;
    case "chat":
      return `${notice.name}: ${notice.text ?? ""}`;
  }
}

/**
 * Drops what has expired and trims to the visible cap, newest kept.
 * Pure, so the hook can run it on a timer without holding any state
 * of its own.
 */
export function pruneNotices(notices: RoomNotice[], now: number): RoomNotice[] {
  const live = notices.filter((n) => now - n.at < NOTICE_TTL_MS);
  return live.length > MAX_VISIBLE_NOTICES ? live.slice(-MAX_VISIBLE_NOTICES) : live;
}
