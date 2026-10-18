import { NextResponse } from "next/server";

import { apiError, apiRoute } from "@/lib/api/request";
import { cancelEvent } from "@/lib/events/core";

/* ------------------------------------------------------------------ */
/*  POST /api/v1/events/:id/cancel — cancel a meeting                  */
/*                                                                     */
/*  A tombstone, not a delete, and everyone on it is mailed a cancel.  */
/*  Organizer or owner only, as in the app. Cancelling twice is a      */
/*  no-op rather than an error.                                        */
/* ------------------------------------------------------------------ */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = apiRoute<{ eventId: string }>(
  { scope: "write", kind: "mail" },
  async ({ caller, params }) => {
    const result = await cancelEvent(caller, params.eventId);
    if (!result.success) return apiError(400, result.error);
    return NextResponse.json({ cancelled: true });
  }
);
