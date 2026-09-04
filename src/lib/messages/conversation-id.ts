/* ------------------------------------------------------------------ */
/*  Conversation ids                                                   */
/*                                                                     */
/*  The opposite decision from `lib/calls/room-id`, and for the        */
/*  opposite reason.                                                   */
/*                                                                     */
/*  A room id is a capability: holding one gets a walk-in into a live  */
/*  meeting, so it has to be unguessable. A conversation id is not.    */
/*  Reading a thread requires being in its `participantIds` — or, for  */
/*  Town Hall, being in the org — checked against the live user doc on */
/*  every read. Guessing the id of a thread you are not in gets you a  */
/*  permission denied and nothing else.                                */
/*                                                                     */
/*  What the id has to be instead is DERIVABLE, so that "open my DM    */
/*  with Sarah" is a lookup rather than a search. Two clients opening  */
/*  the same pair at the same moment write the same document instead   */
/*  of racing to create two threads that then both hold half the       */
/*  conversation — the same get-or-create bargain the calls module     */
/*  makes with rooms, arrived at from the other direction.             */
/* ------------------------------------------------------------------ */

/**
 * What may appear in a derived id.
 *
 * These become a Firestore document id, which is a path segment: a `/`
 * would silently address a different collection, and `.` / `..` are
 * reserved. Firebase uids and Firestore auto-ids are both alphanumeric,
 * so this rejects nothing legitimate and refuses to build a path out of
 * anything it does not recognise.
 */
const SAFE_SEGMENT = /^[A-Za-z0-9_-]{1,128}$/;

function segment(label: string, value: string): string {
  if (typeof value !== "string" || !SAFE_SEGMENT.test(value)) {
    throw new Error(`Invalid ${label} for a conversation id.`);
  }
  return value;
}

/**
 * The org's announcements channel. One per workspace, materialized the
 * first time somebody opens it.
 */
export function townHallConversationId(orgId: string): string {
  return `townhall_${segment("orgId", orgId)}`;
}

/**
 * The thread between two people, whichever way round you ask.
 *
 * Sorting the pair is the whole trick: without it, Sarah opening a DM
 * with Marcus and Marcus opening one with Sarah produce two documents,
 * and each of them sees half of what was said.
 */
export function dmConversationId(orgId: string, uidA: string, uidB: string): string {
  const org = segment("orgId", orgId);
  const a = segment("uid", uidA);
  const b = segment("uid", uidB);

  if (a === b) {
    throw new Error("A direct message needs two different people.");
  }

  const [first, second] = [a, b].sort();
  return `dm_${org}_${first}_${second}`;
}

/** True for an id this module could have produced for this org's Town Hall. */
export function isTownHallConversationId(value: unknown, orgId: string): boolean {
  if (typeof value !== "string") return false;
  try {
    return value === townHallConversationId(orgId);
  } catch {
    return false;
  }
}
