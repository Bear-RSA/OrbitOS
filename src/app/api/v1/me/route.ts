import { NextRequest, NextResponse } from "next/server";

import { authenticateApi } from "@/lib/api/request";

/* ------------------------------------------------------------------ */
/*  GET /api/v1/me — who this token acts as                            */
/*                                                                     */
/*  The first call an assistant makes: it confirms the token works and */
/*  tells it whose tasks "mine" means.                                 */
/* ------------------------------------------------------------------ */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await authenticateApi(req.headers, "read");
  if (!auth.ok) return auth.response;
  const { caller } = auth;

  return NextResponse.json({
    id: caller.uid,
    name: caller.name,
    role: caller.role,
    workspaceId: caller.orgId,
    scopes: caller.scopes,
  });
}
