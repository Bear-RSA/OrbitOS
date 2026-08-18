/**
 * Constrains a caller-supplied redirect target to a path on this origin.
 *
 * Without this, `/login?redirect=https://evil.example` turns a legitimate
 * OrbitOS link into a phishing hop: the user authenticates on the real
 * site and is then handed to the attacker.
 *
 * Dependency-free so the Edge middleware and client components can share it.
 */
export function safeRedirect(
  target: string | null | undefined,
  fallback = "/dashboard"
): string {
  if (!target) return fallback;

  // `searchParams.get()` has already decoded once. Decode defensively in
  // case the value was double-encoded to smuggle a scheme past this check.
  let candidate = target;
  try {
    candidate = decodeURIComponent(target);
  } catch {
    // Malformed percent-encoding — treat as hostile.
    return fallback;
  }

  // Must be root-relative, and not protocol-relative ("//evil.example").
  if (!candidate.startsWith("/") || candidate.startsWith("//")) return fallback;

  // Backslashes are normalised to "/" by some browsers ("/\evil.example").
  if (candidate.includes("\\")) return fallback;

  return candidate;
}
