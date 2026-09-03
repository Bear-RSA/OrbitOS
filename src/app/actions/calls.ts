"use server";

import { createHash } from "crypto";
import { adminDb } from "@/lib/firebase/admin";
import { requireServerUid } from "@/lib/auth/session";
import { getCallProvider } from "@/lib/calls/provider";
import { participantName } from "@/lib/calls/display-name";
import {
  capParticipants,
  capRoomExpiry,
  capTokenSeconds,
} from "@/lib/calls/ceiling";
import type { CallGrant } from "@/types/call";

/* ------------------------------------------------------------------ */
/*  Call Server Actions                                                */
/*                                                                     */
/*  Every provider token in the product is minted here, on the Admin   */
/*  SDK, behind an explicit org check — the same bargain `events.ts`   */
/*  makes for writes. The API key never leaves the server and a token  */
/*  is never built in a browser.                                       */
/*                                                                     */
/*  ONE DELIBERATE DIFFERENCE from `events.ts`: these actions take no  */
/*  `uid` argument. They resolve the caller from the verified session  */
/*  cookie instead, as `lib/auth/session` recommends. A uid passed in  */
/*  from the browser is an unverified claim, and here the thing it     */
/*  buys is a live credential to somebody else's meeting — pass a      */
/*  colleague's uid, get a token to the room they are sitting in. That */
/*  is a different class of mistake from writing a row you are allowed */
/*  to write anyway, so this path does not accept the claim at all.    */
/* ------------------------------------------------------------------ */

export type GrantResult =
  | { success: true; grant: CallGrant }
  | { success: false; error: string };

/** Same shape as the guards in `events.ts`, with an explicit discriminant. */
type Caller =
  | { ok: true; uid: string; orgId: string; name: string; role: string }
  | { ok: false; error: string };

/**
 * Resolves the caller from the session cookie and guarantees they belong
 * to an organization.
 */
async function requireCaller(): Promise<Caller> {
  let uid: string;
  try {
    uid = await requireServerUid();
  } catch {
    return { ok: false, error: "Your session has expired. Sign in again." };
  }

  const snap = await adminDb.collection("users").doc(uid).get();
  if (!snap.exists) return { ok: false, error: "User not found." };

  const data = snap.data()!;
  if (!data.orgId) return { ok: false, error: "Unauthorized." };

  return {
    ok: true,
    uid,
    orgId: data.orgId as string,
    name: (data.name as string) || "Operative",
    role: (data.role as string) || "MEMBER",
  };
}

/* ------------------------------------------------------------------ */
/*  Proof room — TEMPORARY                                             */
/*                                                                     */
/*  Step one of the build: two people, one room, media flowing, before */
/*  any of the scheduling or ringing UI exists to confuse a failure.   */
/*  It proves the provider, the token mint, the session gate and the   */
/*  room component in isolation.                                       */
/*                                                                     */
/*  DELETE THIS, and `/call/proof`, once scheduled calls land. It is   */
/*  org-scoped and session-gated, so it is not a hole — but it is a    */
/*  room with no purpose, and those accumulate.                        */
/* ------------------------------------------------------------------ */

/**
 * One stable room per workspace, derived rather than stored.
 *
 * Hashed so it carries the same shape as a real room id and reveals
 * nothing about the org it belongs to, and salted with a constant so it
 * can never collide with an id from `newRoomId`.
 */
function proofRoomIdFor(orgId: string): string {
  const digest = createHash("sha256").update(`orbit-proof-room:${orgId}`).digest("hex");
  return `r_${digest.slice(0, 24)}`;
}

const PROOF_ROOM_MINUTES = 60;

export async function getProofCallGrantAction(
  rawDisplayName: string
): Promise<GrantResult> {
  try {
    const caller = await requireCaller();
    if (!caller.ok) return { success: false, error: caller.error };

    const provider = await getCallProvider();
    const roomId = proofRoomIdFor(caller.orgId);

    const room = await provider.createRoom({
      name: roomId,
      expiresAt: capRoomExpiry(new Date(Date.now() + PROOF_ROOM_MINUTES * 60_000)),
      maxParticipants: capParticipants(4),
    });

    /* The typed name is a convenience for testing from two windows on one
       account — without it both tiles read the same and there is no way
       to tell which is which. It falls back to the account name, and it
       is sanitized on the way through like any other display name. */
    const displayName = participantName(rawDisplayName || caller.name, false);

    const ttlSeconds = capTokenSeconds(PROOF_ROOM_MINUTES * 60);

    /* Identity gets a per-session suffix for the same reason: one account
       in two windows is two participants, and a provider handed the same
       identity twice may treat the second join as the first reconnecting. */
    const identity = `${caller.uid}:${Math.random().toString(36).slice(2, 8)}`;

    const token = await provider.mintAccessToken({
      room: room.roomName,
      identity,
      displayName,
      canPublish: true,
      ttlSeconds,
      isOwner: true,
    });

    return {
      success: true,
      grant: {
        provider: provider.id,
        roomUrl: room.roomUrl,
        token,
        displayName,
        expiresAt: Date.now() + ttlSeconds * 1000,
      },
    };
  } catch (err: any) {
    console.error("[CallAction] Proof grant failed:", err);
    return {
      success: false,
      error: err?.message || "Could not start the call.",
    };
  }
}
