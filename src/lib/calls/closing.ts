/* ------------------------------------------------------------------ */
/*  Room closing warning                                               */
/*                                                                     */
/*  Every room has a hard expiry, and the provider ejects everyone in  */
/*  it at that moment. Being cut off mid-sentence with no notice is    */
/*  the failure this exists for: the room says so five minutes out,   */
/*  so people can wrap up or move the conversation somewhere else.     */
/* ------------------------------------------------------------------ */

/** How far ahead of the room closing the warning appears. */
export const CLOSING_WARNING_MS = 5 * 60_000;

/**
 * What the warning should say right now, or null when it should not
 * show — no known deadline, too early, or already past.
 *
 * Minutes are rounded up so the count never undersells the time left:
 * at 4m10s it says 5, which is still true at the moment it changes.
 */
export function closingWarning(
  closesAt: number | null | undefined,
  now: number = Date.now()
): string | null {
  if (typeof closesAt !== "number" || !Number.isFinite(closesAt)) return null;

  const left = closesAt - now;
  if (left <= 0 || left > CLOSING_WARNING_MS) return null;

  if (left < 60_000) return "This call ends in under a minute.";
  const minutes = Math.ceil(left / 60_000);
  return minutes === 1 ? "This call ends in 1 minute." : `This call ends in ${minutes} minutes.`;
}
