import { NextResponse } from "next/server";

import { apiError, apiRoute } from "@/lib/api/request";
import { loadMonthReport } from "@/lib/reports/brief-loader";

/* ------------------------------------------------------------------ */
/*  GET /api/v1/reports/month?month=YYYY-MM                            */
/*                                                                     */
/*  The workspace's health numbers for a month — the month so far by   */
/*  default. Owners only, matching who receives the monthly mail: it   */
/*  ranks people by work completed, which is not every member's to     */
/*  read about every other member.                                     */
/* ------------------------------------------------------------------ */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = apiRoute({ scope: "read", kind: "read" }, async ({ req, caller }) => {
  if (caller.role !== "OWNER") {
    return apiError(403, "The monthly report is for workspace owners.");
  }

  const month = req.nextUrl.searchParams.get("month") || undefined;
  if (month !== undefined && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return apiError(400, '"month" must look like 2026-10.');
  }

  return NextResponse.json(await loadMonthReport(caller, month));
});
