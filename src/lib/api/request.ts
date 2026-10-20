import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebase/admin";
import { resolveApiTokenLimit } from "@/lib/auth/permissions";
import {
  MAX_BODY_BYTES,
  admitRequest,
  isAddressBlocked,
  recordAuthFailure,
  type RequestKind,
} from "./ceiling";
import {
  AUDIT_COLLECTION,
  THROTTLE_COLLECTION,
  TOKEN_COLLECTION,
  auditEntryId,
  hashToken,
  isExpired,
  readBearer,
  type StoredToken,
  type TokenScope,
} from "./tokens";

/* ------------------------------------------------------------------ */
/*  The API's front door                                               */
/*                                                                     */
/*  Every `/api/v1` handler is wrapped in `apiRoute`, so no route can  */
/*  forget a check. In order, cheapest first:                          */
/*                                                                     */
/*    1. the address has not been failing auth in a loop (memory)      */
/*    2. the header is shaped like one of our tokens (free)            */
/*    3. the token exists, is not revoked, has not expired (one read)  */
/*    4. its owner is still in that workspace (one read)               */
/*    5. the workspace has not switched the API off (cached)           */
/*    6. the scope covers this route; the plan allows tokens (cached)  */
/*    7. the per-token throttle admits it (one transaction)            */
/*    8. the body is under the size cap                                */
/*                                                                     */
/*  Then the handler runs. A change is written to the audit log with   */
/*  its outcome, and any throw comes back as a plain 500 — a stack     */
/*  trace or a Firestore message is a map of the system for whoever    */
/*  is probing it.                                                     */
/* ------------------------------------------------------------------ */

export interface ApiCaller {
  uid: string;
  orgId: string;
  name: string;
  role: string;
  tokenId: string;
  tokenName: string;
  scopes: TokenScope[];
}

export function apiError(status: number, message: string): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

/** Audit entries are kept this long; set a Firestore TTL policy on `expireAt` to enforce it. */
const AUDIT_RETENTION_DAYS = 90;

/** How long a workspace's on/off switch is trusted from memory. */
const ORG_SWITCH_TTL_MS = 30_000;
const orgSwitchCache = new Map<string, { disabled: boolean; expires: number }>();

/** Failed authentications per address, on this instance. */
const authFailures = new Map<string, { start: number; count: number }>();

/** Called by the owner's switch so this instance stops trusting a stale "on". */
export function forgetOrgSwitch(orgId: string): void {
  orgSwitchCache.delete(orgId);
}

async function isApiDisabledFor(orgId: string): Promise<boolean> {
  const now = Date.now();
  const hit = orgSwitchCache.get(orgId);
  if (hit && hit.expires > now) return hit.disabled;

  const snap = await adminDb.collection("organizations").doc(orgId).get();
  const disabled = snap.data()?.apiAccessDisabled === true;
  orgSwitchCache.set(orgId, { disabled, expires: now + ORG_SWITCH_TTL_MS });
  return disabled;
}

function clientAddress(headers: Headers): string {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    "unknown"
  );
}

type Gate = { ok: true; caller: ApiCaller } | { ok: false; response: NextResponse };

/** Steps 1 to 7 above. */
async function authenticate(headers: Headers, scope: TokenScope, kind: RequestKind): Promise<Gate> {
  const now = Date.now();
  const address = clientAddress(headers);

  if (isAddressBlocked(authFailures, address, now)) {
    return { ok: false, response: apiError(429, "Too many failed attempts. Wait a minute.") };
  }

  const refuse = (status: number, message: string): Gate => {
    if (status === 401) recordAuthFailure(authFailures, address, now);
    return { ok: false, response: apiError(status, message) };
  };

  const token = readBearer(headers.get("authorization"));
  if (!token) return refuse(401, "Missing or malformed bearer token.");

  const tokenId = hashToken(token);
  const tokenSnap = await adminDb.collection(TOKEN_COLLECTION).doc(tokenId).get();
  const stored = tokenSnap.exists ? (tokenSnap.data() as StoredToken) : null;
  if (!stored || stored.revokedAt) {
    return refuse(401, "This token is not valid. Create a new one in Settings.");
  }
  if (isExpired(stored, now)) {
    return refuse(401, "This token has expired. Create a new one in Settings.");
  }

  // A token is only as good as the membership behind it. Removal from the
  // workspace deletes `orgId` on the user, which kills every token they hold.
  const userSnap = await adminDb.collection("users").doc(stored.uid).get();
  const user = userSnap.exists ? userSnap.data()! : null;
  if (!user || user.orgId !== stored.orgId) {
    return refuse(401, "This token's owner is no longer in the workspace.");
  }

  if (await isApiDisabledFor(stored.orgId)) {
    return refuse(403, "API access is switched off for this workspace.");
  }

  if (!stored.scopes.includes(scope)) {
    return refuse(403, scope === "write" ? "This token is read-only." : "This token cannot do that.");
  }

  if ((await resolveApiTokenLimit(stored.orgId)) === 0) {
    return refuse(402, "API access needs a paid plan.");
  }

  const throttleRef = adminDb.collection(THROTTLE_COLLECTION).doc(tokenId);
  const verdict = await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(throttleRef);
    const result = admitRequest(snap.exists ? snap.data() : undefined, kind, now);
    tx.set(throttleRef, result.window);
    return result;
  });

  if (!verdict.allowed) {
    const message =
      verdict.reason === "mail"
        ? "Daily limit for meeting changes reached for this token. They send email, so they are capped at 30 a day."
        : verdict.reason === "writes"
          ? "Daily change limit reached for this token. It resets 24 hours after the first change."
          : "Too many requests. Wait a minute and try again.";
    return refuse(429, message);
  }

  // Best-effort and coarse: the settings list shows "last used", and a
  // write per request just to keep that to the second is not worth paying for.
  const lastUsed = stored.lastUsedAt?.toMillis() ?? 0;
  if (now - lastUsed > 5 * 60_000) {
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
      tokenName: stored.name,
      scopes: stored.scopes,
    },
  };
}

type Body = { ok: true; body: Record<string, unknown> | null } | { ok: false; response: NextResponse };

/** Step 8: reads a JSON object body, refusing anything over the cap. */
async function readBody(req: NextRequest): Promise<Body> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) {
    return { ok: false, response: apiError(413, "Request body too large.") };
  }
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) {
    return { ok: false, response: apiError(413, "Request body too large.") };
  }
  if (!text) return { ok: true, body: null };
  try {
    const parsed = JSON.parse(text);
    return {
      ok: true,
      body: parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null,
    };
  } catch {
    return { ok: true, body: null };
  }
}

/**
 * One line per change made through the API. No request bodies: the log
 * says who, which token, what kind of change and whether it worked, and
 * the activity log already holds the substance.
 */
async function audit(caller: ApiCaller, req: NextRequest, status: number): Promise<void> {
  const now = Date.now();
  try {
    await adminDb.collection(AUDIT_COLLECTION).doc(auditEntryId(caller.uid, now)).set({
      uid: caller.uid,
      orgId: caller.orgId,
      tokenId: caller.tokenId,
      tokenName: caller.tokenName,
      method: req.method,
      path: req.nextUrl.pathname,
      status,
      at: Timestamp.fromMillis(now),
      expireAt: Timestamp.fromMillis(now + AUDIT_RETENTION_DAYS * 86_400_000),
    });
  } catch (err) {
    console.error("[API] Failed to write audit entry:", err);
  }
}

function harden(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}

export interface ApiContext<P> {
  req: NextRequest;
  caller: ApiCaller;
  params: P;
  /** The JSON body, or null when there is none or it is not an object. Always null on GET. */
  body: Record<string, unknown> | null;
}

/**
 * Wraps a route handler in the front door. `kind` is what the request
 * costs against the throttle: "mail" for anything that sends email.
 */
export function apiRoute<P = Record<string, never>>(
  options: { scope: TokenScope; kind: RequestKind },
  handler: (ctx: ApiContext<P>) => Promise<NextResponse>
) {
  return async (req: NextRequest, context: { params: Promise<P> }): Promise<NextResponse> => {
    const gate = await authenticate(req.headers, options.scope, options.kind);
    if (!gate.ok) return harden(gate.response);

    let body: Record<string, unknown> | null = null;
    if (req.method !== "GET") {
      const read = await readBody(req);
      if (!read.ok) return harden(read.response);
      body = read.body;
    }

    let response: NextResponse;
    try {
      const params = (context?.params ? await context.params : {}) as P;
      response = await handler({ req, caller: gate.caller, params, body });
    } catch (err) {
      console.error(`[API] ${req.method} ${req.nextUrl.pathname} failed:`, err);
      response = apiError(500, "Something went wrong. Try again.");
    }

    if (options.kind !== "read") await audit(gate.caller, req, response.status);
    return harden(response);
  };
}
