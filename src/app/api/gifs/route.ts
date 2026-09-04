import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import { gifSearchGuard } from "@/lib/messages/gif-guard";
import {
  GifProviderUnconfigured,
  searchMedia,
  type MediaKind,
} from "@/lib/messages/gif-provider";

/* ------------------------------------------------------------------ */
/*  GIF and sticker search                                             */
/*                                                                     */
/*  The browser never sees the provider key, so search cannot be a     */
/*  direct call from the picker. This is the seam: session-gated,      */
/*  rate-limited, and it hands back results already shaped as the      */
/*  attachment the client would store.                                 */
/*                                                                     */
/*  Signed-in only. Not because the catalogue is secret — it is        */
/*  public — but because an open endpoint here is an open proxy onto   */
/*  our quota, and the bill for that arrives whether or not anyone     */
/*  using it has an account.                                           */
/* ------------------------------------------------------------------ */

// firebase-admin is Node-only; it cannot run on the Edge runtime.
export const runtime = "nodejs";

const KINDS: MediaKind[] = ["gif", "sticker"];

/** Long enough for a phrase, short enough that it is not a payload. */
const MAX_QUERY_LENGTH = 100;

export async function GET(request: NextRequest) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admission = gifSearchGuard.admit(session.uid);
  if (!admission.allowed) {
    return NextResponse.json(
      { error: "Slow down a moment." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(admission.retryAfterMs / 1000)) },
      }
    );
  }

  const params = request.nextUrl.searchParams;
  const query = (params.get("q") ?? "").slice(0, MAX_QUERY_LENGTH);
  const requested = params.get("kind") as MediaKind | null;
  const kind: MediaKind = requested && KINDS.includes(requested) ? requested : "gif";

  try {
    /* No caller identity is passed on. The provider has no business
       holding our user ids, and nothing about a GIF search needs it —
       the session was checked here, which is where it matters. */
    const results = await searchMedia({ query, kind });

    return NextResponse.json({ results });
  } catch (err) {
    if (err instanceof GifProviderUnconfigured) {
      /* 503 rather than 500: nothing is broken, the feature is simply
         not switched on for this deployment. The picker says so
         instead of showing an empty grid. */
      return NextResponse.json(
        { error: "GIFs are not configured for this workspace." },
        { status: 503 }
      );
    }

    console.error("[GIFs] Search failed:", err);
    return NextResponse.json({ error: "Could not reach the GIF library." }, { status: 502 });
  }
}
