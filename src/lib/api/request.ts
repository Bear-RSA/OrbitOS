import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebase/admin";
import { resolveApiTokenLimit } from "@/lib/auth/permissions";
import { admitRequest } from "./ceiling";
import {
  THROTTLE_COLLECTION,
  TOKEN_COLLECTION,
  hashToken,
  readBearer,
  type StoredToken,
  type TokenScope,
} from "./tokens";

/* ------------------------------------------------------------------ */
/*  Who is calling the API?                                            */
/*                                                                     */
/*  The token-holding counterpart of `lib/auth/caller`. Route handlers */
/*  under `/api/v1` run on the Admin SDK exactly like server actions,  */
/*  so the identity resolved here is the whole of their authorization. */
/*                                                                     */
/*  Order matters for cost: shape check (free), token read, user read, */
/*  plan check (cached), then the throttle write. A garbage header     */
/*  never reaches Firestore.                                           */
/* ------------------------------------------------------------------ */

export interface ApiCaller {
  uid: string;
  orgId: string;
  name: string;
  role: string;
  tokenId: string;
  scopes: TokenScope[];
}

export type ApiAuth = { ok: true; caller: ApiCaller } | { ok: false; response: NextResponse };

export function apiError(status: number, message: string): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Resolves the caller from the bearer token and charges the request
 * against its throttle. `scope` is what the route needs; a `write`
 * route also counts against the daily write ceiling.
 */
export async function authenticateApi(
  headers: Headers,
  scope: TokenScope
): Promise<ApiAuth> {
  const token = readBearer(headers.get("authorization"));
  if (!token) {
    return { ok: false, response: apiError(401, "Missing or malformed bearer token.") };
  }

  const tokenId = hashToken(token);
  const tokenSnap = await adminDb.collection(TOKEN_COLLECTION).doc(tokenId).get();
  const stored = tokenSnap.exists ? (tokenSnap.data() as StoredToken) : null;
  if (!stored || stored.revokedAt) {
    return { ok: false, response: apiError(401, "This token is not valid. Create a new one in Settings.") };
  }

  // A token is only as good as the membership behind it. Removal from the
  // workspace deletes `orgId` on the user, which kills every token they hold.
  const userSnap = await adminDb.collection("users").doc(stored.uid).get();
  const user = userSnap.exists ? userSnap.data()! : null;
  if (!user || user.orgId !== stored.orgId) {
    return { ok: false, response: apiError(401, "This token's owner is no longer in the workspace.") };
  }

  if (!stored.scopes.includes(scope)) {
    return { ok: false, response: apiError(403, "This token is read-only.") };
  }

  if ((await resolveApiTokenLimit(stored.orgId)) === 0) {
    return { ok: false, response: apiError(402, "API access needs a paid plan.") };
  }

  const throttleRef = adminDb.collection(THROTTLE_COLLECTION).doc(tokenId);
  const verdict = await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(throttleRef);
    const result = admitRequest(snap.exists ? snap.data() : undefined, scope === "write", Date.now());
    tx.set(throttleRef, result.window);
    return result;
  });

  if (!verdict.allowed) {
    return {
      ok: false,
      response: apiError(
        429,
        verdict.reason === "writes"
          ? "Daily write limit reached for this token. It resets 24 hours after the first write."
          : "Too many requests. Wait a minute and try again."
      ),
    };
  }

  // Best-effort and coarse: the settings list shows "last used", and a
  // write per request just to keep that to the second is not worth paying for.
  const lastUsed = stored.lastUsedAt?.toMillis() ?? 0;
  if (Date.now() - lastUsed > 5 * 60_000) {
    tokenSnap.ref.update({ lastUsedAt: Timestamp.now() }).catch(() => {});
  }

  return {
    ok: true,
    caller: {
      uid: stored.uid,
      orgId: stored.orgId,
      name: (user.name as string) || "Unnamed member",
      role: (user.role as string) || "MEMBER",
      tokenId,
      scopes: stored.scopes,
    },
  };
}

/** Reads a JSON body, or null when it is missing or not JSON. */
export async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await req.json();
    return body && typeof body === "object" && !Array.isArray(body) ? body : null;
  } catch {
    return null;
  }
}
