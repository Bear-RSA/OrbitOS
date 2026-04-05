import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_ROUTES = ["/", "/login", "/signup", "/join"];
const AUTH_ROUTES = ["/login", "/signup"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public routes and API routes
  if (
    PUBLIC_ROUTES.some((r) => pathname === r) ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/favicon")
  ) {
    return NextResponse.next();
  }

  // For protected routes, we rely on client-side auth checks
  // (Firebase auth state is client-side; middleware can't verify it without session cookies)
  // Add server-side session cookie verification here when scaling
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
