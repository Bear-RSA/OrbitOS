import { LOBBY_POLL_MS } from "./access";
import type { CallLobby } from "@/types/call";

/* ------------------------------------------------------------------ */
/*  Lobby timing                                                       */
/*                                                                     */
/*  How long a waiting page sits before asking the server again. The   */
/*  server stays the only judge of whether someone is let in; this     */
/*  only decides when to ask.                                          */
/* ------------------------------------------------------------------ */

/**
 * Milliseconds until the next attempt.
 *
 * Waiting on a host asks every few seconds, so the room opens for
 * everyone close to the moment one walks in. Waiting on the clock
 * asks when the room opens — never sooner than the poll interval, so a
 * device clock that disagrees with the server's cannot turn the wait
 * into a tight loop.
 */
export function lobbyRetryDelay(lobby: CallLobby, now: number = Date.now()): number {
  if (lobby.kind === "host") return LOBBY_POLL_MS;
  return Math.max(LOBBY_POLL_MS, lobby.opensAt - now);
}
