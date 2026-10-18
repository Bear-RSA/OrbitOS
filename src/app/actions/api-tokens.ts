"use server";

import { Timestamp } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebase/admin";
import { requireCaller } from "@/lib/auth/caller";
import { resolveApiTokenLimit } from "@/lib/auth/permissions";
import { MAX_TOKEN_NAME_LENGTH, effectiveTokenLimit } from "@/lib/api/ceiling";
import {
  THROTTLE_COLLECTION,
  TOKEN_COLLECTION,
  generateToken,
  hashToken,
  hintFor,
  normaliseScopes,
  type TokenScope,
} from "@/lib/api/tokens";

/* ------------------------------------------------------------------ */
/*  Personal access token actions                                      */
/*                                                                     */
/*  Every one of these acts on the caller's own tokens only. A token   */
/*  is that person's reach inside the workspace, so nobody — owners    */
/*  included — mints or sees one on someone else's behalf.             */
/* ------------------------------------------------------------------ */

export interface ApiTokenSummary {
  id: string;
  name: string;
  hint: string;
  scopes: TokenScope[];
  createdAt: string;
  lastUsedAt: string | null;
}

type ListResult =
  | { success: true; tokens: ApiTokenSummary[]; limit: number }
  | { success: false; error: string };

export async function listApiTokensAction(): Promise<ListResult> {
  try {
    const caller = await requireCaller();
    if (!caller.ok) return { success: false, error: caller.error };

    const [snap, tierLimit] = await Promise.all([
      adminDb.collection(TOKEN_COLLECTION).where("uid", "==", caller.uid).get(),
      resolveApiTokenLimit(caller.orgId),
    ]);

    const tokens = snap.docs
      .filter((doc) => !doc.data().revokedAt && doc.data().orgId === caller.orgId)
      .map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          name: data.name,
          hint: data.hint,
          scopes: data.scopes,
          createdAt: (data.createdAt as Timestamp).toDate().toISOString(),
          lastUsedAt: data.lastUsedAt ? (data.lastUsedAt as Timestamp).toDate().toISOString() : null,
        };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return { success: true, tokens, limit: effectiveTokenLimit(tierLimit) };
  } catch (err: any) {
    console.error("[ApiTokens] Failed to list:", err);
    return { success: false, error: "Could not load your tokens." };
  }
}

type CreateResult =
  | { success: true; token: string }
  | { success: false; error: string };

/** Returns the plaintext token. This is the only time it exists outside the caller's hands. */
export async function createApiTokenAction(payload: {
  name: string;
  scopes: TokenScope[];
}): Promise<CreateResult> {
  try {
    const caller = await requireCaller();
    if (!caller.ok) return { success: false, error: caller.error };

    const name = (payload.name ?? "").trim().slice(0, MAX_TOKEN_NAME_LENGTH);
    if (!name) return { success: false, error: "Give the token a name, like \"Home assistant\"." };

    const limit = effectiveTokenLimit(await resolveApiTokenLimit(caller.orgId));
    if (limit === 0) {
      return { success: false, error: "AI access is on paid plans. Upgrade to create a token." };
    }

    const existing = await adminDb.collection(TOKEN_COLLECTION).where("uid", "==", caller.uid).get();
    const live = existing.docs.filter((doc) => !doc.data().revokedAt && doc.data().orgId === caller.orgId);
    if (live.length >= limit) {
      return { success: false, error: `You can hold ${limit} tokens. Revoke one first.` };
    }

    const token = generateToken();
    await adminDb.collection(TOKEN_COLLECTION).doc(hashToken(token)).set({
      uid: caller.uid,
      orgId: caller.orgId,
      name,
      scopes: normaliseScopes(payload.scopes),
      hint: hintFor(token),
      createdAt: Timestamp.now(),
      lastUsedAt: null,
      revokedAt: null,
    });

    return { success: true, token };
  } catch (err: any) {
    console.error("[ApiTokens] Failed to create:", err);
    return { success: false, error: "Could not create the token." };
  }
}

/** Deletes the token outright; anything still using it gets a 401 on its next request. */
export async function revokeApiTokenAction(payload: {
  id: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const caller = await requireCaller();
    if (!caller.ok) return { success: false, error: caller.error };

    if (!payload.id || !/^[0-9a-f]{64}$/.test(payload.id)) {
      return { success: false, error: "Token not found." };
    }

    const ref = adminDb.collection(TOKEN_COLLECTION).doc(payload.id);
    const snap = await ref.get();
    if (!snap.exists || snap.data()?.uid !== caller.uid) {
      return { success: false, error: "Token not found." };
    }

    await Promise.all([
      ref.delete(),
      adminDb.collection(THROTTLE_COLLECTION).doc(payload.id).delete(),
    ]);
    return { success: true };
  } catch (err: any) {
    console.error("[ApiTokens] Failed to revoke:", err);
    return { success: false, error: "Could not revoke the token." };
  }
}
