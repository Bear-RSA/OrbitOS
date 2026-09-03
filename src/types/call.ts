import { Timestamp } from "firebase/firestore";

/* ------------------------------------------------------------------ */
/*  Call Schema                                                        */
/*                                                                     */
/*  Two things are called a "call" here and they are deliberately not  */
/*  the same record.                                                   */
/*                                                                     */
/*  A SCHEDULED call is an engagement that owns a room — it lives on   */
/*  `OrbitEvent`, because it already has a time, an attendee list, and */
/*  RSVPs, and duplicating those into a second collection would give   */
/*  two answers to "who is invited".                                   */
/*                                                                     */
/*  A DIRECT call is this collection. It has no time, no invitation    */
/*  and no RSVP: it is one person ringing another right now, and the   */
/*  only questions it answers are who, whom, and did they pick up.     */
/*  Modelling that as an engagement would mean writing a calendar      */
/*  entry every time somebody clicks a name.                           */
/* ------------------------------------------------------------------ */

/**
 * `ringing` is the only state a call can be answered from, and it is
 * time-bounded — see `ringingExpiresAt`.
 *
 * `missed` and `declined` are separated on purpose: one is an answer and
 * the other is an absence, and the caller reads them very differently.
 */
export type CallStatus = "ringing" | "active" | "ended" | "declined" | "missed";

export interface OrbitCall {
  id: string;
  orgId: string;

  /** Opaque room capability — see `lib/calls/room-id`. */
  roomId: string;

  /** Caller uid. */
  from: string;
  /** Callee uid. */
  to: string;

  /**
   * Names denormalized at write time, same contract as `guestNames` on an
   * engagement. The ring UI has one job — say who is calling, instantly —
   * and resolving a uid through the directory first would put a Firestore
   * read in front of a phone ringing.
   */
  fromName: string;
  toName: string;

  status: CallStatus;

  /**
   * When the ring stops being answerable.
   *
   * Enforced server-side in `answerCallAction`, not by a cleanup job. A
   * `ringing` document that nothing ever tidied up is already dead by
   * this field, so the absence of a cron leaves no hole — the worst case
   * is a stale row, not an answerable call from yesterday.
   */
  ringingExpiresAt: Timestamp;

  createdAt: Timestamp;
  answeredAt: Timestamp | null;
  endedAt: Timestamp | null;
  /** uid of whoever hung up, or null when the ring simply timed out. */
  endedBy: string | null;
}

/* ------------------------------------------------------------------ */
/*  Join grants                                                        */
/* ------------------------------------------------------------------ */

export type CallProviderId = "daily" | "livekit";

/**
 * Everything a client needs to enter a room, and nothing it needs to
 * decide whether it may.
 *
 * The provider is named in the payload rather than assumed, which is
 * what keeps the swap to LiveKit a new file instead of a refactor: the
 * room component switches on this one field, and every gate that
 * produced the grant is provider-agnostic already.
 *
 * A grant is a bearer credential with a short life. It is returned from
 * a server action straight into the component that uses it — never
 * stored, never logged, never put in a URL.
 */
export interface CallGrant {
  provider: CallProviderId;
  /** The provider's own join target. */
  roomUrl: string;
  token: string;
  /** What the rest of the room will see. */
  displayName: string;
  /** Unix millis — the client stops trusting the grant after this. */
  expiresAt: number;
}

/** Why a join was refused, for the screens that have to say something. */
export interface CallDenied {
  reason:
    | "not-a-call"
    | "not-invited"
    | "not-started"
    | "ended"
    | "tier"
    | "unavailable";
  message: string;
}
