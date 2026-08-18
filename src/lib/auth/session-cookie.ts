/* ------------------------------------------------------------------ */
/*  Session Cookie Constants (Edge-safe)                               */
/*                                                                     */
/*  Kept free of firebase-admin imports so middleware, which runs on   */
/*  the Edge runtime, can share these values with the Node-side code   */
/*  in `./session.ts`.                                                 */
/* ------------------------------------------------------------------ */

/**
 * Firebase Hosting only forwards a cookie named `__session` to backends,
 * so this name stays portable across hosting providers.
 */
export const SESSION_COOKIE_NAME = "__session";

/** Session cookie lifetime. Firebase caps session cookies at 14 days. */
export const SESSION_MAX_AGE_MS = 5 * 24 * 60 * 60 * 1000; // 5 days
