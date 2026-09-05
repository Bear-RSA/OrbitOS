import { adminDb } from "@/lib/firebase/admin";
import { requireServerUid } from "./session";

/* ------------------------------------------------------------------ */
/*  Who is making this request?                                        */
/*                                                                     */
/*  Server actions run with the Admin SDK, which bypasses Firestore    */
/*  rules by design. That makes the identity a server action acts on   */
/*  the whole of its authorization, and it has to come from the        */
/*  session cookie.                                                    */
/*                                                                     */
/*  Many actions here used to take a `uid` in their payload instead.   */
/*  A uid from the browser is a claim, not a credential: any signed-in */
/*  user could send someone else's and act as them — delete their      */
/*  work, read their workspace, file log entries under their name.     */
/*  The uid parameters survive in some signatures so existing call     */
/*  sites keep compiling, but they are ignored; this is the only       */
/*  answer to "who is calling" that any of them trust.                 */
/*                                                                     */
/*  `calls.ts` and `messages.ts` each grew a private copy of this      */
/*  guard first. This is that same shape, lifted somewhere the rest of */
/*  the action layer can reach it.                                     */
/* ------------------------------------------------------------------ */

export type Caller =
  | { ok: true; uid: string; orgId: string; name: string; role: string }
  | { ok: false; error: string };

/**
 * Resolves the caller from the session cookie and guarantees they belong
 * to an organization. Never throws — the failure is a value, so actions
 * can return it as their own error without a try/catch.
 */
export async function requireCaller(): Promise<Caller> {
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

/**
 * The caller, required to hold OWNER clearance.
 *
 * A convenience over `requireCaller` for the actions that are owner-only,
 * so the role check reads the same way everywhere rather than being
 * re-spelled per call site.
 */
export async function requireOwner(): Promise<Caller> {
  const caller = await requireCaller();
  if (!caller.ok) return caller;
  if (caller.role !== "OWNER") {
    return { ok: false, error: "Unauthorized. Requires OWNER operations clearance." };
  }
  return caller;
}
