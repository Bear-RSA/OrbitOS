import { participantName } from "./display-name";
import { getCallProvider, assertServerOnly } from "./provider";
import { capParticipants, capRoomExpiry, capTokenSeconds } from "./ceiling";
import type { CallGrant } from "@/types/call";

/* ------------------------------------------------------------------ */
/*  Room passes                                                        */
/*                                                                     */
/*  The single place a provider token is created. It lived inside      */
/*  `actions/calls` until scheduled calls needed it from a second      */
/*  action file — a guest arriving off their invitation is vetted in   */
/*  `actions/rsvp`, beside the gates that already know what a signed   */
/*  RSVP link proves — and a second copy of the ceiling clamps and the */
/*  guest marking is a second place to forget one of them.             */
/*                                                                     */
/*  It decides nothing about permission. Every caller has already run  */
/*  the relevant gate in `lib/calls/access`; this only turns "yes"     */
/*  into a credential.                                                 */
/* ------------------------------------------------------------------ */

export interface GrantRequest {
  roomId: string;
  identity: string;
  displayName: string;
  /** Members get room-management rights; guests and walk-ins never do. */
  isMember: boolean;
  minutes: number;
  /**
   * Seats in the room. Clamped again by `capParticipants` below, so a
   * caller that gets this wrong cannot widen the ceiling.
   *
   * Defaults to a pair, which is what a direct call is. Group and
   * scheduled calls pass the number the thread or the invitation list
   * and the plan worked out between them — the room is created on first
   * join and every joiner after that finds it, so a room built for two
   * would turn the third person away from a call they belong in.
   */
  maxParticipants?: number;
}

/**
 * Mints one room pass.
 *
 * Idempotent on the room: `createRoom` is get-or-create by contract, so
 * the first joiner materializes it and everyone after finds it there.
 */
export async function grantFor(request: GrantRequest): Promise<CallGrant> {
  assertServerOnly("grantFor");

  const provider = await getCallProvider();

  const displayName = participantName(request.displayName, !request.isMember);
  const ttlSeconds = capTokenSeconds(request.minutes * 60);

  /* Side by side, not one after the other. A token names its room but
     does not need the room to exist yet, so there is nothing to wait
     for — and every round trip to the provider here is time somebody
     spends looking at a loader after pressing Answer. */
  const [room, token] = await Promise.all([
    provider.createRoom({
      name: request.roomId,
      expiresAt: capRoomExpiry(new Date(Date.now() + request.minutes * 60_000)),
      maxParticipants: capParticipants(request.maxParticipants ?? 2),
    }),
    provider.mintAccessToken({
      room: request.roomId,
      identity: request.identity,
      displayName,
      canPublish: true,
      ttlSeconds,
      isOwner: request.isMember,
      /* A colleague has already chosen to take this call; a camera
         check and a second Join button is only delay. A guest keeps it —
         it is where they see the name they typed before others do. */
      skipPrejoin: request.isMember,
    }),
  ]);

  return {
    provider: provider.id,
    roomId: request.roomId,
    roomUrl: room.roomUrl,
    token,
    displayName,
    expiresAt: Date.now() + ttlSeconds * 1000,
    roomClosesAt: room.expiresAt?.getTime() ?? null,
  };
}
