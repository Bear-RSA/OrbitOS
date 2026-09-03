import { randomBytes } from "crypto";

/* ------------------------------------------------------------------ */
/*  Room ids                                                           */
/*                                                                     */
/*  A room id is a capability, not a label. Someone who has it can ask */
/*  to be let into the room — that is the whole point of the walk-in   */
/*  path, where a person with no account and no invite types a name    */
/*  and enters.                                                        */
/*                                                                     */
/*  Which is why it is random rather than derived. Deriving it from an */
/*  engagement id would mean anyone who has ever seen a link to an     */
/*  engagement holds the key to its room, and engagement ids travel:   */
/*  they are in RSVP links, in the activity log, in error traces. The  */
/*  two must not be computable from one another in either direction.   */
/*                                                                     */
/*  96 bits. Guessing one is not a threat model anybody has to think   */
/*  about again, and it still fits well inside the 41-character room   */
/*  name ceiling every provider we have looked at imposes.             */
/* ------------------------------------------------------------------ */

/** `r_` plus 24 hex characters. */
const ROOM_ID_SHAPE = /^r_[0-9a-f]{24}$/;

export function newRoomId(): string {
  return `r_${randomBytes(12).toString("hex")}`;
}

/**
 * True for a string this module could have produced.
 *
 * Every entry point takes the room id from a URL, so this runs before
 * the id reaches Firestore or the provider API. It is a shape check and
 * nothing more — that a room EXISTS, and that the caller may enter it,
 * are separate questions answered in `access.ts`.
 */
export function isRoomId(value: unknown): value is string {
  return typeof value === "string" && ROOM_ID_SHAPE.test(value);
}
