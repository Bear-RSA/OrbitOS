import type { CallProviderId } from "@/types/call";

/* ------------------------------------------------------------------ */
/*  Call provider seam                                                 */
/*                                                                     */
/*  Daily today, LiveKit when the participant-minute bill makes         */
/*  self-hosting worth the operational weight. The bet this file makes */
/*  is that the swap should be ONE new file, so nothing outside        */
/*  `lib/calls` may import a provider SDK or know a provider's name.   */
/*                                                                     */
/*  The interface is deliberately two methods wide. Everything that    */
/*  differs between providers — how a room is addressed, what a token  */
/*  is signed with, which properties a room takes — stays behind them; */
/*  everything that decides WHO may join stays in front, in the server */
/*  actions, where it is the same logic whatever is carrying the       */
/*  media.                                                             */
/* ------------------------------------------------------------------ */

export interface CreateRoomOptions {
  /** Our own room id. The provider is told what to call it, not asked. */
  name: string;
  /** The room stops working here. Already clamped by `ceiling.ts`. */
  expiresAt: Date;
  maxParticipants: number;
}

export interface CreatedRoom {
  roomName: string;
  /**
   * The provider's join target.
   *
   * Required, though the two providers mean different things by it — a
   * room URL for Daily, a signalling endpoint for LiveKit. Callers pass
   * it through to the client inside a `CallGrant` and never parse it,
   * which is what lets one field cover both.
   */
  roomUrl: string;
}

export interface MintTokenOptions {
  room: string;
  /** Stable subject id: a uid, a guest id, or a per-session walk-in id. */
  identity: string;
  displayName: string;
  /**
   * False puts someone in the room without a microphone or camera.
   * Unused today — every join path publishes — but it is the difference
   * between a meeting and a broadcast, and providers express it at token
   * mint time, so the seam has to carry it.
   */
  canPublish: boolean;
  /** Already clamped by `ceiling.ts`. */
  ttlSeconds: number;
  /**
   * Room-management rights: ejecting, muting others, ending the call for
   * everyone. Members get it, guests and walk-ins never do.
   */
  isOwner?: boolean;
}

export interface CallProvider {
  readonly id: CallProviderId;

  /**
   * Get-or-create, not create.
   *
   * Rooms are materialized on first join rather than when an engagement
   * is scheduled — fifty calls nobody attends should cost nothing — so
   * every joiner races to create the same room and all of them must
   * succeed. An implementation that throws on "already exists" has the
   * contract wrong.
   */
  createRoom(options: CreateRoomOptions): Promise<CreatedRoom>;

  mintAccessToken(options: MintTokenOptions): Promise<string>;
}

/**
 * Guards the module boundary that actually matters.
 *
 * A provider holds the API key. If one is ever constructed in a browser
 * bundle the key is in the bundle, so this fails loudly at the seam
 * rather than leaving the mistake to be found in a network tab.
 */
export function assertServerOnly(who: string): void {
  if (typeof window !== "undefined") {
    throw new Error(
      `${who} is server-only — it holds the provider API key. Reach it through a server action.`
    );
  }
}

/**
 * Resolves the configured provider.
 *
 * Defaults to Daily when `CALL_PROVIDER` is unset: it is the only
 * implementation that exists, and a missing env var should not be the
 * difference between calling working and not. An unrecognised value is a
 * different matter — that is a typo in a deploy, and silently falling
 * back would route calls through a provider nobody chose.
 */
export async function getCallProvider(): Promise<CallProvider> {
  const configured = (process.env.CALL_PROVIDER || "daily").trim().toLowerCase();

  if (configured === "daily") {
    const { dailyProvider } = await import("./daily-provider");
    return dailyProvider;
  }

  throw new Error(
    `Unknown CALL_PROVIDER "${configured}". Supported: daily.`
  );
}
