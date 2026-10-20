import { NextResponse } from "next/server";

import { apiRoute } from "@/lib/api/request";
import { loadMyWeek } from "@/lib/reports/brief-loader";

/* ------------------------------------------------------------------ */
/*  GET /api/v1/reports/my-week                                        */
/*                                                                     */
/*  The token owner's next seven days: overdue, due, blocked, and      */
/*  meetings. The one call an assistant needs for "how's my week".     */
/* ------------------------------------------------------------------ */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = apiRoute({ scope: "read", kind: "read" }, async ({ caller }) =>
  NextResponse.json(await loadMyWeek(caller))
);
