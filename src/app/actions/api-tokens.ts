"use server";

import { FieldPath, Timestamp } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebase/admin";
import { requireCaller, requireOwner } from "@/lib/auth/caller";
import { resolveApiTokenLimit } from "@/lib/auth/permissions";
import { MAX_TOKEN_NAME_LENGTH, effectiveTokenLimit } from "@/lib/api/ceiling";
import { forgetOrgSwitch } from "@/lib/api/request";
import {
  AUDIT_COLLECTION,
  THROTTLE_COLLECTION,
  TOKEN_COLLECTION,
  generateToken,
  hashToken,
  hintFor,
  isExpired,
  normaliseLifetime,
  normaliseScopes,
  type TokenScope,
} from "@/lib/api/tokens";

/* ------------------------------------------------------------------ */
/*  Personal access token actions                                      */
/*                                                                     */
/*  A person mints and sees only their own tokens: a token is their    */
/*  reach inside the workspace, so nobody — owners included — mints    */
/*  one on someone else's behalf or ever sees another's plaintext.     */
/*                                                                     */
/*  Owners get the other half: they can see that a token exists, who   */
/*  holds it and when it was last used, revoke it, and switch the API  */
/*  off for the whole workspace. Somebody has to be able to stop an    */
/*  assistant that is misbehaving under a colleague's name.            */
/* ------------------------------------------------------------------ */

const DAY_MS = 86_400_000;

export interface ApiTokenSummary {
  id: string;
  name: string;
  hint: string;
  scopes: TokenScope[];
  createdAt: string;
  expiresAt: string | null;
  expired: boolean;
  lastUsedAt: string | null;
}

function iso(value: unknown): string | null {
  return value instanceof Timestamp ? value.toDate().toISOString() : null;
}

function summarise(doc: FirebaseFirestore.DocumentSnapshot, now: number): ApiTokenSummary {
  const data = doc.data()!;
  return {
    id: doc.id,
    name: data.name,
    hint: data.hint,
    scopes: data.scopes,
    createdAt: iso(data.createdAt) ?? "",
    expiresAt: iso(data.expiresAt),
    expired: isExpired(data as { expiresAt?: Timestamp | null }, now),
    lastUsedAt: iso(data.lastUsedAt),
  };
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

    const now = Date.now();
    const tokens = snap.docs
      .filter((doc) => !doc.data().revokedAt && doc.data().orgId === caller.orgId)
      .map((doc) => summarise(doc, now))
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
  lifetimeDays: number;
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

    const orgSnap = await adminDb.collection("organizations").doc(caller.orgId).get();
    if (orgSnap.data()?.apiAccessDisabled === true) {
      return { success: false, error: "An owner has switched AI access off for this workspace." };
    }

    // Expired tokens still count until revoked, so a person tidies up
    // rather than accumulating dead keys up to the ceiling.
    const existing = await adminDb.collection(TOKEN_COLLECTION).where("uid", "==", caller.uid).get();
    const held = existing.docs.filter((doc) => !doc.data().revokedAt && doc.data().orgId === caller.orgId);
    if (held.length >= limit) {
      return { success: false, error: `You can hold ${limit} tokens. Revoke one first.` };
    }

    const lifetimeDays = normaliseLifetime(payload.lifetimeDays);
    const token = generateToken();
    await adminDb.collection(TOKEN_COLLECTION).doc(hashToken(token)).set({
      uid: caller.uid,
      orgId: caller.orgId,
      name,
      scopes: normaliseScopes(payload.scopes),
      hint: hintFor(token),
      createdAt: Timestamp.now(),
      expiresAt: Timestamp.fromMillis(Date.now() + lifetimeDays * DAY_MS),
      lastUsedAt: null,
      revokedAt: null,
    });

    return { success: true, token };
  } catch (err: any) {
    console.error("[ApiTokens] Failed to create:", err);
    return { success: false, error: "Could not create the token." };
  }
}

/**
 * Deletes a token outright; anything still using it gets a 401 on its
 * next request. Your own token, or — for an owner — any token in the
 * workspace.
 */
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
    const data = snap.data();
    const own = data?.uid === caller.uid;
    const ownersCall = caller.role === "OWNER" && data?.orgId === caller.orgId;
    if (!snap.exists || !(own || ownersCall)) {
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

/* ------------------------------------------------------------------ */
/*  Activity                                                           */
/* ------------------------------------------------------------------ */

export interface ApiAuditEntry {
  id: string;
  tokenName: string;
  method: string;
  path: string;
  status: number;
  at: string;
}

type AuditResult =
  | { success: true; entries: ApiAuditEntry[] }
  | { success: false; error: string };

/**
 * The caller's last changes made through the API, newest first. Entry
 * ids start with the uid and count time backwards, so this is a plain
 * document-id range read.
 */
export async function listApiActivityAction(): Promise<AuditResult> {
  try {
    const caller = await requireCaller();
    if (!caller.ok) return { success: false, error: caller.error };

    const snap = await adminDb
      .collection(AUDIT_COLLECTION)
      .where(FieldPath.documentId(), ">=", `${caller.uid}_`)
      .where(FieldPath.documentId(), "<", `${caller.uid}_~`)
      .limit(20)
      .get();

    return {
      success: true,
      entries: snap.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          tokenName: data.tokenName,
          method: data.method,
          path: data.path,
          status: data.status,
          at: iso(data.at) ?? "",
        };
      }),
    };
  } catch (err: any) {
    console.error("[ApiTokens] Failed to list activity:", err);
    return { success: false, error: "Could not load recent activity." };
  }
}

/* ------------------------------------------------------------------ */
/*  Owner controls                                                     */
/* ------------------------------------------------------------------ */

export interface WorkspaceTokenSummary extends ApiTokenSummary {
  holderId: string;
  holderName: string;
}

type WorkspaceResult =
  | { success: true; enabled: boolean; tokens: WorkspaceTokenSummary[] }
  | { success: false; error: string };

/** Every token in the workspace, who holds it, and whether the API is on. Owners only. */
export async function listWorkspaceTokensAction(): Promise<WorkspaceResult> {
  try {
    const caller = await requireOwner();
    if (!caller.ok) return { success: false, error: caller.error };

    const [tokensSnap, usersSnap, orgSnap] = await Promise.all([
      adminDb.collection(TOKEN_COLLECTION).where("orgId", "==", caller.orgId).get(),
      adminDb.collection("users").where("orgId", "==", caller.orgId).get(),
      adminDb.collection("organizations").doc(caller.orgId).get(),
    ]);

    const names = new Map(usersSnap.docs.map((doc) => [doc.id, (doc.data().name as string) || "Unnamed member"]));
    const now = Date.now();

    const tokens = tokensSnap.docs
      .filter((doc) => !doc.data().revokedAt)
      .map((doc) => ({
        ...summarise(doc, now),
        holderId: doc.data().uid as string,
        holderName: names.get(doc.data().uid) ?? "Former member",
      }))
      .sort((a, b) => a.holderName.localeCompare(b.holderName) || b.createdAt.localeCompare(a.createdAt));

    return { success: true, enabled: orgSnap.data()?.apiAccessDisabled !== true, tokens };
  } catch (err: any) {
    console.error("[ApiTokens] Failed to list workspace tokens:", err);
    return { success: false, error: "Could not load the workspace's tokens." };
  }
}

/**
 * The workspace kill switch. Off refuses every token on its next
 * request (within 30 seconds on other server instances) without
 * deleting them, so switching back on restores everyone's setup.
 */
export async function setWorkspaceApiAccessAction(payload: {
  enabled: boolean;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const caller = await requireOwner();
    if (!caller.ok) return { success: false, error: caller.error };

    await adminDb
      .collection("organizations")
      .doc(caller.orgId)
      .set({ apiAccessDisabled: !payload.enabled }, { merge: true });
    forgetOrgSwitch(caller.orgId);
    return { success: true };
  } catch (err: any) {
    console.error("[ApiTokens] Failed to set workspace API access:", err);
    return { success: false, error: "Could not change AI access for the workspace." };
  }
}
