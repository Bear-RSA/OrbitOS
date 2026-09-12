import { HARD_MAX_PARTICIPANTS, capParticipants } from "./ceiling";

/* ------------------------------------------------------------------ */
/*  Who is in a direct call                                            */
/*                                                                     */
/*  A direct call used to be exactly its `from` and `to`. Now anyone   */
/*  in one can ring a third person in, so the pair is who started it   */
/*  and `participants` is who is in it — and every reader has to       */
/*  agree on how to get from one to the other, including for calls     */
/*  written before the list existed. This is that one place.           */
/* ------------------------------------------------------------------ */

/** The fields this module reads off a call, from either SDK. */
export interface PartyShapedCall {
  from: string;
  to: string;
  fromName?: string;
  toName?: string;
  status: string;
  participants?: string[] | null;
  participantNames?: Record<string, string> | null;
}

/**
 * Everyone in the call.
 *
 * A call with no list is one from before the list existed: its pair is
 * its party, both of them once it was answered and only the caller
 * while it rings — which is also what the caller's own list would have
 * said, had it been written.
 */
export function callParticipants(call: PartyShapedCall): string[] {
  if (Array.isArray(call.participants) && call.participants.length > 0) {
    return call.participants;
  }
  return call.status === "ringing" ? [call.from] : [call.from, call.to];
}

/** uid → name for everyone in the call, with the same fallback. */
export function callParticipantNames(call: PartyShapedCall): Record<string, string> {
  if (call.participantNames && Object.keys(call.participantNames).length > 0) {
    return call.participantNames;
  }
  const names: Record<string, string> = { [call.from]: call.fromName || "Operative" };
  if (call.status !== "ringing") names[call.to] = call.toName || "Operative";
  return names;
}

/** True when this person is in the call, or is one of its two ends. */
export function isOnCall(call: PartyShapedCall, uid: string): boolean {
  return call.from === uid || call.to === uid || callParticipants(call).includes(uid);
}

/**
 * Seats in a direct call's room.
 *
 * The plan's cap, or the ceiling when the plan does not narrow it. Not
 * two, though a direct call starts as two: the room is created before
 * anyone answers and `createRoom` is get-or-create, so a room built for
 * a pair could never take a third person however many the plan allows.
 * Only bodies in the room are billed, so a seat nobody sits in costs
 * nothing.
 */
export function directCallSeats(tierMax: number): number {
  return capParticipants(tierMax === -1 ? HARD_MAX_PARTICIPANTS : tierMax);
}

/**
 * The names of everyone else in the call, for a headline.
 *
 * "Alice", "Alice and Bob", "Alice, Bob and Carol". Whoever is asking is
 * left out — a bar reading "In a call with you" is a bar that is wrong.
 */
export function othersInCall(call: PartyShapedCall, uid: string): string[] {
  const names = callParticipantNames(call);
  return callParticipants(call)
    .filter((id) => id !== uid)
    .map((id) => names[id] || "Operative");
}

export function listNames(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
