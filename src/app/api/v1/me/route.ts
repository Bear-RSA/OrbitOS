import { NextResponse } from "next/server";

import { apiRoute } from "@/lib/api/request";

/* ------------------------------------------------------------------ */
/*  GET /api/v1/me — who this token acts as                            */
/*                                                                     */
/*  The first call an assistant makes: it confirms the token works and */
/*  tells it whose tasks "mine" means and what it is allowed to do.    */
/* ------------------------------------------------------------------ */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = apiRoute({ scope: "read", kind: "read" }, async ({ caller }) =>
  NextResponse.json({
    id: caller.uid,
    name: caller.name,
    role: caller.role,
    workspaceId: caller.orgId,
    token: caller.tokenName,
    scopes: caller.scopes,
  })
);
