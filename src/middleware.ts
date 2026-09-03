import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session-cookie";
import { safeRedirect } from "@/lib/utils/safe-redirect";

/* ------------------------------------------------------------------ */
/*  Route Gate                                                         */
/*                                                                     */
/*  Deny-by-default: anything not listed below requires a session      */
/*  cookie. Adding a new marketing page means adding it here.          */
/*                                                                     */
/*  NOTE: middleware runs on the Edge runtime, where firebase-admin    */
/*  cannot load — so this checks that a session cookie is PRESENT, not */
/*  that it is valid. It is a redirect/UX gate and defence in depth,   */
/*  never the authorization boundary. Real enforcement belongs in      */
/*  server actions and route handlers via `getServerSession()`.        */
/* ------------------------------------------------------------------ */

const PUBLIC_ROUTES = new Set([
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
 * Screens a signed-in visitor has no business on. Deliberately excludes
 * /forgot-password and /reset-password: a user following the link from their
 * inbox may still be holding a session cookie, and bouncing them to the
 * dashboard would leave them unable to finish the reset.
 */
const AUTH_ROUTES = new Set(["/login", "/signup"]);

/**
 * Public routes whose path carries an argument, so they cannot be matched
 * by exact set membership.
 *
 * `/rsvp/<token>` is reachable without a session on purpose: the whole
 * point is that a guest with no OrbitOS account can answer an invitation
 * from their inbox. The signed token in the path is the credential, and
 * it is verified server-side in `actions/rsvp` — bouncing these visitors
 * to /login would break the only flow they have.
 */
const PUBLIC_PREFIXES = [/^\/rsvp\//];

/**
 * Next.js metadata routes. These are fetched by unauthenticated social and
 * search crawlers that never carry a session cookie, and they have no file
 * extension — so without this they fall through to the deny-by-default gate
 * and 307 to /login, which renders every shared link as a blank card.
 */
const METADATA_ROUTE =
  /^\/(opengraph-image|twitter-image|icon|apple-icon|manifest|robots|sitemap)/;

/**
 * Builds an absolute redirect URL from a root-relative target, keeping any
 * query string in `search` rather than letting it be encoded into the path.
 */
function resolve(request: NextRequest, target: string): URL {
  const url = request.nextUrl.clone();
  const queryStart = target.indexOf("?");
  url.pathname = queryStart === -1 ? target : target.slice(0, queryStart);
  url.search = queryStart === -1 ? "" : target.slice(queryStart);
  return url;
}

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Framework internals and API routes authenticate themselves. Anything
  // with a file extension is a static asset (/icon.svg, /logo.png) and must
  // stay reachable for logged-out visitors on the marketing pages.
  if (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    METADATA_ROUTE.test(pathname) ||
    /\.[a-zA-Z0-9]+$/.test(pathname)
  ) {
    return NextResponse.next();
  }

  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE_NAME)?.value);

  // Signed-in users have no business on the login/signup screens. Honour
  // the pending redirect so invite links survive the bounce.
  if (hasSession && AUTH_ROUTES.has(pathname)) {
    return NextResponse.redirect(
      resolve(request, safeRedirect(request.nextUrl.searchParams.get("redirect")))
    );
  }

  if (PUBLIC_ROUTES.has(pathname) || PUBLIC_PREFIXES.some((re) => re.test(pathname))) {
    return NextResponse.next();
  }

  if (!hasSession) {
    const url = resolve(request, "/login");
    url.searchParams.set("redirect", `${pathname}${search}`);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
