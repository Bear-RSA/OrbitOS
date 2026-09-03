import {
  assertServerOnly,
  type CallProvider,
  type CreatedRoom,
  type CreateRoomOptions,
  type MintTokenOptions,
} from "./provider";

/* ------------------------------------------------------------------ */
/*  Daily provider                                                     */
/*                                                                     */
/*  The only file in the codebase that knows Daily exists. Everything  */
/*  here is REST — no SDK on the server — because the two calls we     */
/*  make are a room upsert and a token mint, and a dependency that     */
/*  wraps two POSTs is a dependency to keep current for no gain.       */
/*                                                                     */
/*  DAILY_API_KEY is read inside the functions rather than at module   */
/*  scope. Reading it at import time means a deploy missing the key    */
/*  fails when the module is first pulled in — which, in a Next build, */
/*  can be during collection of an unrelated page.                     */
/* ------------------------------------------------------------------ */

const API = "https://api.daily.co/v1";

/** Daily is normally well under a second; this is a hang, not a wait. */
const REQUEST_TIMEOUT_MS = 10_000;

function apiKey(): string {
  assertServerOnly("daily-provider");

  const key = process.env.DAILY_API_KEY;
  if (!key) {
    throw new Error(
      "DAILY_API_KEY is not set — calling is unavailable on this deployment."
    );
  }
  return key;
}

interface DailyRoom {
  name: string;
  url: string;
}

/**
 * One request, with the failure surface flattened.
 *
 * Daily's error bodies carry useful detail and no secrets, so they are
 * logged; what goes back to the caller is deliberately vague, because a
 * join screen saying "room not found" tells someone probing room ids
 * that the rest of their guess was right.
 */
async function request<T>(
  path: string,
  init: { method: "GET" | "POST"; body?: unknown }
): Promise<{ ok: true; data: T } | { ok: false; status: number; detail: string }> {
  let response: Response;

  try {
    response = await fetch(`${API}${path}`, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (err: any) {
    // A timeout or a DNS failure is not a 4xx; give it a status of its own.
    return { ok: false, status: 0, detail: err?.message ?? "network failure" };
  }

  const text = await response.text();

  if (!response.ok) {
    return { ok: false, status: response.status, detail: text.slice(0, 400) };
  }

  try {
    return { ok: true, data: JSON.parse(text) as T };
  } catch {
    return { ok: false, status: response.status, detail: "unparseable response" };
  }
}

/** Daily takes expiry as whole unix seconds. */
const unix = (date: Date) => Math.floor(date.getTime() / 1000);

/**
 * Turns a provider failure into something the person reading it can act
 * on.
 *
 * A rejected credential and a provider outage both used to surface as
 * "unavailable", which is true and useless — one is a deploy to fix in a
 * minute, the other is waiting. The most common cause of the first is an
 * API key pasted WITH its surrounding quotes: dotenv strips those, most
 * dashboards do not, so the same value works locally and 401s in
 * production.
 */
function providerFailure(status: number, action: string): Error {
  if (status === 401 || status === 403) {
    return new Error(
      "Calling is misconfigured on this deployment: the call service rejected our credentials. Check DAILY_API_KEY is set without surrounding quotes."
    );
  }
  if (status === 0) {
    return new Error("Could not reach the call service. Try again.");
  }
  return new Error(`The call service is unavailable (${action} failed).`);
}

export const dailyProvider: CallProvider = {
  id: "daily",

  async createRoom(options: CreateRoomOptions): Promise<CreatedRoom> {
    assertServerOnly("daily-provider.createRoom");

    /* Read before write. Every joiner after the first finds the room
       already there, and asking costs one GET against a create that
       would fail anyway. */
    const existing = await request<DailyRoom>(`/rooms/${options.name}`, { method: "GET" });
    if (existing.ok) {
      return { roomName: existing.data.name, roomUrl: existing.data.url };
    }
    if (existing.status !== 404) {
      console.error(
        `[DailyProvider] Room lookup failed (${existing.status}): ${existing.detail}`
      );
      throw providerFailure(existing.status, "room lookup");
    }

    const created = await request<DailyRoom>("/rooms", {
      method: "POST",
      body: {
        name: options.name,
        /* Private: entry requires a meeting token, and every token this
           app mints has already passed an org or invitation check. A
           public room would make the room id alone sufficient to join,
           which is exactly what the id is designed not to be. */
        privacy: "private",
        properties: {
          exp: unix(options.expiresAt),
          /* The cost control that actually bites. Without it an expired
             room keeps billing for whoever is still sitting in it. */
          eject_at_room_exp: true,
          max_participants: options.maxParticipants,
          /* Device pick and mic check before anyone is live. It also
             gives the walk-in path a second look at the name they typed
             before it lands on other people's screens. */
          enable_prejoin_ui: true,
          enable_screenshare: true,
          enable_chat: true,
        },
      },
    });

    if (created.ok) {
      return { roomName: created.data.name, roomUrl: created.data.url };
    }

    /* Two people joining an empty room at once both see a 404 and both
       create. One loses. Losing means the room exists, which is what the
       caller wanted, so re-read rather than fail. */
    if (created.status === 400) {
      const retry = await request<DailyRoom>(`/rooms/${options.name}`, { method: "GET" });
      if (retry.ok) {
        return { roomName: retry.data.name, roomUrl: retry.data.url };
      }
    }

    console.error(
      `[DailyProvider] Room create failed (${created.status}): ${created.detail}`
    );
    throw providerFailure(created.status, "room create");
  },

  async mintAccessToken(options: MintTokenOptions): Promise<string> {
    assertServerOnly("daily-provider.mintAccessToken");

    const result = await request<{ token: string }>("/meeting-tokens", {
      method: "POST",
      body: {
        properties: {
          room_name: options.room,
          user_name: options.displayName,
          /* Daily caps this at 36 characters. Firebase uids are 28 and
             guest ids 26, so nothing real is truncated — but a provider
             rejecting the whole token mint over a long id would surface
             as "cannot join" with no clue why. */
          user_id: options.identity.slice(0, 36),
          is_owner: options.isOwner === true,
          exp: unix(new Date(Date.now() + options.ttlSeconds * 1000)),
          ...(options.canPublish ? {} : { permissions: { canSend: [] } }),
        },
      },
    });

    if (!result.ok) {
      console.error(
        `[DailyProvider] Token mint failed (${result.status}): ${result.detail}`
      );
      throw providerFailure(result.status, "token mint");
    }

    return result.data.token;
  },
};
