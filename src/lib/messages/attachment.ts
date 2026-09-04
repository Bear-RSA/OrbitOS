import type { MessageAttachment } from "@/types/message";

/* ------------------------------------------------------------------ */
/*  Attachment validation                                              */
/*                                                                     */
/*  The host allowlist is the whole point of this file, and it is a    */
/*  security control rather than tidiness.                             */
/*                                                                     */
/*  A message attachment becomes an <img src> in every participant's   */
/*  browser. A member able to write an arbitrary URL there has a       */
/*  tracking pixel: point it at a server they control and every        */
/*  colleague who so much as scrolls past the message reports their IP */
/*  address, their user agent, and the moment they read it. Nothing    */
/*  about that requires the image to exist.                            */
/*                                                                     */
/*  So the URL may only name the provider's own CDN, and this check is */
/*  mirrored in `firestore.rules` — the client refuses first so the    */
/*  user gets an error rather than a rejected write, and the rule      */
/*  refuses last because the client can be edited.                     */
/* ------------------------------------------------------------------ */

/**
 * GIPHY serves media from `media.giphy.com`, its numbered shards
 * (`media0`–`media4`, whichever answered) and `i.giphy.com`.
 *
 * Anchored at BOTH ends, and the host sits immediately after the
 * scheme. Without that, `https://evil.test/media.giphy.com/x.gif`
 * passes a naive `includes` check — the classic way an allowlist turns
 * out to allow everything.
 *
 * The query string is permitted because GIPHY's URLs carry one (`?cid=
 * …&ep=…&rid=…`) and stripping it breaks the image. The character
 * classes still exclude `@`, so a credentialed URL pointing somewhere
 * else cannot slip past either.
 */
const GIPHY_MEDIA =
  /^https:\/\/(?:media[0-9]*|i)\.giphy\.com\/[A-Za-z0-9._~\-/]+(?:\?[A-Za-z0-9._~\-/&=%]*)?$/;

/** Beyond this a "description" is somebody storing text in the wrong field. */
export const MAX_ALT_LENGTH = 200;

/** Guards against a zero-height box or an absurd reserved space. */
const MIN_DIMENSION = 1;
const MAX_DIMENSION = 4_000;

export function isAllowedMediaUrl(value: unknown): value is string {
  return typeof value === "string" && GIPHY_MEDIA.test(value);
}

/**
 * Whether this is an attachment the client may send and the rules will
 * accept. Structural only — that the GIF exists is the CDN's problem.
 */
export function isValidAttachment(value: unknown): value is MessageAttachment {
  if (!value || typeof value !== "object") return false;
  const a = value as Record<string, unknown>;

  const keys = Object.keys(a).sort().join(",");
  if (keys !== "alt,height,kind,previewUrl,provider,providerId,url,width") {
    return false;
  }

  if (a.kind !== "gif" && a.kind !== "sticker") return false;
  if (a.provider !== "giphy") return false;

  if (!isAllowedMediaUrl(a.url) || !isAllowedMediaUrl(a.previewUrl)) return false;

  if (typeof a.providerId !== "string" || !a.providerId || a.providerId.length > 64) {
    return false;
  }

  if (typeof a.alt !== "string" || a.alt.length > MAX_ALT_LENGTH) return false;

  for (const size of [a.width, a.height]) {
    if (
      typeof size !== "number" ||
      !Number.isInteger(size) ||
      size < MIN_DIMENSION ||
      size > MAX_DIMENSION
    ) {
      return false;
    }
  }

  return true;
}

/**
 * Whether a send is worth making at all.
 *
 * A message needs to say something: either words, or a picture. Neither
 * is an empty row in somebody's transcript.
 */
export function hasContent(text: string, attachment: unknown): boolean {
  return text.trim().length > 0 || isValidAttachment(attachment);
}
