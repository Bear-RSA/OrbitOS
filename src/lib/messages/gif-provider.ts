import type { MessageAttachment } from "@/types/message";

/* ------------------------------------------------------------------ */
/*  GIF provider seam — GIPHY                                          */
/*                                                                     */
/*  SERVER ONLY. The API key never reaches a browser, the same bargain */
/*  `lib/calls/provider` makes with Daily. Search runs through         */
/*  `/api/gifs`, which is session-gated; a key shipped to the client   */
/*  would be a key anyone can lift out of the bundle and spend.        */
/*                                                                     */
/*  WHY NOT TENOR: Google closed Tenor API sign-ups on 13 January 2026 */
/*  and decommissioned the API entirely on 30 June 2026. It is not a   */
/*  future risk, it is already gone — a request against it today fails.*/
/*  GIPHY is the remaining general-purpose catalogue that still issues */
/*  keys, and it serves stickers from a parallel set of endpoints, so  */
/*  one integration still covers both halves.                          */
/*                                                                     */
/*  Kept behind this module so nothing outside it knows a provider's   */
/*  name. That seam earned its keep on the very first swap — the only  */
/*  things that moved with it were this file, the host allowlist in    */
/*  `lib/messages/attachment`, and the matching rule.                  */
/* ------------------------------------------------------------------ */

const ENDPOINT = "https://api.giphy.com/v1";

/**
 * GIPHY's strictest rating — general audiences.
 *
 * This is a tool people use at work, with colleagues and sometimes with
 * a client looking over a shoulder. The default rating is not the right
 * default for that room.
 */
const RATING = "g";

/**
 * Enough to fill the grid twice without scrolling into a second fetch.
 *
 * Kept modest on purpose: a beta key allows 100 searches an hour, and
 * the way to stay inside that is fewer, larger requests.
 */
export const SEARCH_LIMIT = 24;

export type MediaKind = "gif" | "sticker";

/** Thrown when the deployment has no key configured. */
export class GifProviderUnconfigured extends Error {
  constructor() {
    super("GIF search is not configured.");
    this.name = "GifProviderUnconfigured";
  }
}

interface GiphyRendition {
  url?: string;
  width?: string;
  height?: string;
}

interface GiphyResult {
  id?: string;
  title?: string;
  alt_text?: string;
  images?: Record<string, GiphyRendition>;
}

/** GIPHY reports dimensions as strings. */
function toInt(value: string | undefined): number | null {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function pick(
  images: Record<string, GiphyRendition> | undefined,
  names: string[]
): GiphyRendition | null {
  if (!images) return null;
  for (const name of names) {
    const rendition = images[name];
    if (rendition?.url) return rendition;
  }
  return null;
}

function toAttachment(result: GiphyResult, kind: MediaKind): MessageAttachment | null {
  /* `downsized` before `original`: a reaction does not need a 5MB
     master, and every participant pays to load whichever is stored. */
  const main = pick(result.images, ["downsized", "fixed_width", "original"]);
  const small = pick(result.images, ["fixed_width_small", "preview_gif", "fixed_width"]);

  if (!result.id || !main?.url || !small?.url) return null;

  const width = toInt(main.width);
  const height = toInt(main.height);
  if (!width || !height) return null;

  return {
    kind,
    url: main.url,
    previewUrl: small.url,
    width,
    height,
    /* `alt_text` when GIPHY has one, the title otherwise. Falls back to
       something honest rather than to an empty alt, which tells a
       screen reader nothing at all. */
    alt: (result.alt_text || result.title || `A ${kind}`).slice(0, 200),
    provider: "giphy",
    providerId: result.id,
  };
}

interface SearchOptions {
  query: string;
  kind: MediaKind;
}

/**
 * Searches GIPHY, or returns what is trending when the query is empty.
 *
 * Results are shaped into `MessageAttachment` here so nothing outside
 * this file handles a provider's response format — and so everything
 * the client is offered is already the shape it would store.
 */
export async function searchMedia({
  query,
  kind,
}: SearchOptions): Promise<MessageAttachment[]> {
  const key = process.env.GIPHY_API_KEY;
  if (!key) throw new GifProviderUnconfigured();

  const trimmed = query.trim();

  const params = new URLSearchParams({
    api_key: key,
    limit: String(SEARCH_LIMIT),
    rating: RATING,
  });
  if (trimmed) params.set("q", trimmed);

  /* Stickers are a parallel set of endpoints rather than a flag. */
  const collection = kind === "sticker" ? "stickers" : "gifs";
  const path = trimmed ? "search" : "trending";

  const response = await fetch(`${ENDPOINT}/${collection}/${path}?${params}`, {
    /* Trending changes slowly and "thumbs up" does not change at all.
       With a 100-per-hour beta quota this cache is not an optimisation,
       it is most of what keeps the feature inside its allowance. */
    next: { revalidate: 600 },
  });

  if (!response.ok) {
    throw new Error(`GIPHY responded ${response.status}`);
  }

  const body = (await response.json()) as { data?: GiphyResult[] };

  return (body.data ?? [])
    .map((result) => toAttachment(result, kind))
    .filter((a): a is MessageAttachment => a !== null);
}
