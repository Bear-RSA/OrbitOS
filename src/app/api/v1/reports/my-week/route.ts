import { NextRequest, NextResponse } from "next/server";

import { authenticateApi } from "@/lib/api/request";
import { loadMyWeek } from "@/lib/reports/brief-loader";

/* ------------------------------------------------------------------ */
/*  GET /api/v1/reports/my-week                                        */
/*                                                                     */
/*  The token owner's next seven days: overdue, due, blocked, and      */
/*  meetings. The one call an assistant needs for "how's my week".     */
/* ------------------------------------------------------------------ */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await authenticateApi(req.headers, "read");
  if (!auth.ok) return auth.response;
  return NextResponse.json(await loadMyWeek(auth.caller));
}
