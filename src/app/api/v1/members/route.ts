import { NextRequest, NextResponse } from "next/server";

import { adminDb } from "@/lib/firebase/admin";
import { authenticateApi } from "@/lib/api/request";

/* ------------------------------------------------------------------ */
/*  GET /api/v1/members — people in the workspace                      */
/*                                                                     */
/*  So an assistant told "give this to Thandi" can find Thandi's id.   */
/*  Only what a teammate already sees in the app: name, email, role.   */
/* ------------------------------------------------------------------ */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await authenticateApi(req.headers, "read");
  if (!auth.ok) return auth.response;

  const snap = await adminDb.collection("users").where("orgId", "==", auth.caller.orgId).get();
  const members = snap.docs
    .map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        name: (data.name as string) || "Unnamed member",
        email: (data.email as string) || null,
        role: (data.role as string) || "MEMBER",
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json({ members });
}
