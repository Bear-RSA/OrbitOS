/**
 * Resolves the application base URL using environment variables.
 *
 * Priority:
 *   1. NEXT_PUBLIC_APP_URL  — explicitly set by the developer
 *   2. VERCEL_URL           — auto-injected by Vercel (server-only, no protocol)
 *   3. the canonical production host — www, never the apex, which only
 *      307-redirects to it
 */
export function getAppUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return "https://www.orbit-os.co.za";
}