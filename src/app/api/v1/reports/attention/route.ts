import { NextResponse } from "next/server";

import { apiRoute } from "@/lib/api/request";
import { loadAttention } from "@/lib/reports/brief-loader";

/* ------------------------------------------------------------------ */
/*  GET /api/v1/reports/attention?projectId=                           */
/*                                                                     */
/*  What is slipping: overdue, blocked, unassigned and stalled work,   */
/*  across the workspace or within one project. Open to any member —  */
/*  it is what the dashboard already shows them.                      */
/* ------------------------------------------------------------------ */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = apiRoute({ scope: "read", kind: "read" }, async ({ req, caller }) => {
  const projectId = req.nextUrl.searchParams.get("projectId") || undefined;
  return NextResponse.json(await loadAttention(caller, projectId));
});
