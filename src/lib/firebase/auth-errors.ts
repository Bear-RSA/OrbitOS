/* ------------------------------------------------------------------ */
/*  Plain-language auth errors                                         */
/*                                                                     */
/*  Firebase rejects with messages like "Firebase: Error              */
/*  (auth/network-request-failed)." The auth screens used to show that */
/*  string as-is on any code they did not special-case, at the moment  */
/*  a new user is least likely to forgive it. This maps the codes a    */
/*  person can actually hit to a sentence that says what to do next.   */
/*                                                                     */
/*  Errors this app throws itself (session setup, timeouts) are        */
/*  already written for people and pass through unchanged.             */
/* ------------------------------------------------------------------ */

const MESSAGES: Record<string, string> = {
  "auth/invalid-credential": "That email and password don't match. Check both and try again.",
  "auth/wrong-password": "That email and password don't match. Check both and try again.",
  "auth/user-not-found": "That email and password don't match. Check both and try again.",
  "auth/invalid-email": "That email address doesn't look right. Check it for typos.",
  "auth/email-already-in-use":
    "An account with this email already exists. Sign in instead, or reset your password.",
  "auth/weak-password": "Choose a stronger password: at least 8 characters.",
  "auth/too-many-requests":
    "Too many attempts from this device. Wait a few minutes, then try again.",
  "auth/network-request-failed": "Couldn't reach OrbitOS. Check your connection and try again.",
  "auth/user-disabled": "This account has been disabled. Contact your workspace owner.",
  "auth/expired-action-code": "This link has expired. Request a new one.",
  "auth/invalid-action-code": "This link is no longer valid. Request a new one.",
  "permission-denied": "You don't have access to do that. Sign in again and retry.",
  unavailable: "Couldn't reach OrbitOS. Check your connection and try again.",
};

const GENERIC = "Something went wrong on our side. Try again in a moment.";

function codeOf(err: unknown): string | null {
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code: unknown }).code;
    if (typeof code === "string") return code;
  }
  // Some paths rethrow only the message; recover the code from it.
  if (err instanceof Error) {
    const match = /\(([a-z]+\/[a-z0-9-]+)\)/.exec(err.message);
    if (match) return match[1];
  }
  return null;
}

/** A sentence safe to show a person, whatever was thrown. */
export function friendlyAuthError(err: unknown, fallback: string = GENERIC): string {
  const code = codeOf(err);
  if (code) return MESSAGES[code] ?? fallback;
  if (err instanceof Error && err.message && !err.message.startsWith("Firebase")) {
    return err.message;
  }
  return fallback;
}
