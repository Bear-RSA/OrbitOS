"use client";

/**
 * Starts downloading the call client before anyone has picked up.
 *
 * `call-room` imports Daily on demand, so the bundle used to begin its
 * download only after Answer — on a phone, seconds of loader that the
 * ring had already sat through doing nothing. Fired while a call rings
 * or is being placed, the import is in the module cache by the time the
 * room asks for it. Idempotent: a second import is the cached promise.
 */
export function preloadCallClient(): void {
  void import("@daily-co/daily-js").catch(() => {
    /* The room will try again when it mounts, and say so if it fails. */
  });
}
