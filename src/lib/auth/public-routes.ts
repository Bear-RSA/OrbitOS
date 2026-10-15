/* ------------------------------------------------------------------ */
/*  Public routes                                                      */
/*                                                                     */
/*  Everything reachable without a session cookie. Read by the route   */
/*  gate in `middleware.ts`, and by `AuthProvider`, which has to know  */
/*  when a page it is on could only have been reached WITH a cookie.   */
/*  Edge-safe: no imports, nothing but strings and patterns.           */
/* ------------------------------------------------------------------ */

export const PUBLIC_ROUTES = new Set([
  "/",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/join",
  "/pricing",
  "/methodology",
  "/changelog",
  "/privacy",
  "/terms",
  "/security",
  "/contact-sales",
]);

/**
 * Public routes whose path carries an argument, so they cannot be matched
 * by exact set membership.
 *
 * `/rsvp/<token>` is reachable without a session on purpose: the whole
 * point is that a guest with no OrbitOS account can answer an invitation
 * from their inbox. The signed token in the path is the credential, and
 * it is verified server-side in `actions/rsvp` — bouncing these visitors
 * to /login would break the only flow they have.
 *
 * `/call/<roomId>` is the same bargain for a scheduled call. A forwarded
 * link lands someone with no account here, and the page lets them type a
 * name and ask to be let in; whether they ARE is decided server-side in
 * `actions/calls` against the engagement's window and the plan. A member
 * arriving at the same URL is recognised by their session on the page
 * and sent into the app. Only the room-id shape is public — `/call/proof`
 * and anything else under it still needs a session.
 */
export const PUBLIC_PREFIXES = [/^\/rsvp\//, /^\/call\/r_[0-9a-f]{24}$/];

/** True for any path the route gate lets through without a session. */
export function isPublicPath(pathname: string): boolean {
  return PUBLIC_ROUTES.has(pathname) || PUBLIC_PREFIXES.some((re) => re.test(pathname));
}
