import { NextResponse } from "next/server";

import { adminDb } from "@/lib/firebase/admin";
import { apiRoute } from "@/lib/api/request";

/* ------------------------------------------------------------------ */
/*  GET /api/v1/projects — the workspace's projects                    */
/*                                                                     */
/*  Every task belongs to one, so creating a task starts here.         */
/*  Archived projects are left out unless asked for, matching the app. */
/* ------------------------------------------------------------------ */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = apiRoute({ scope: "read", kind: "read" }, async ({ req, caller }) => {
  const includeArchived = req.nextUrl.searchParams.get("includeArchived") === "true";
  const snap = await adminDb.collection("projects").where("orgId", "==", caller.orgId).get();

  const projects = snap.docs
    .map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        name: (data.name as string) || "Untitled project",
        description: (data.description as string) || "",
        archived: Boolean(data.archived),
      };
    })
    .filter((project) => includeArchived || !project.archived)
    .sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json({ projects });
});
