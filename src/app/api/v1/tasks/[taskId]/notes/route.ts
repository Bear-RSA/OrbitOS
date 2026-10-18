import { NextRequest, NextResponse } from "next/server";

import { apiError, authenticateApi, readJson } from "@/lib/api/request";
import { addTaskNote } from "@/lib/tasks/core";

/* ------------------------------------------------------------------ */
/*  POST /api/v1/tasks/:id/notes — add a note                          */
/*                                                                     */
/*  How an assistant reports back on work it did: the result goes on   */
/*  the task as a note, under the token owner's name.                  */
/* ------------------------------------------------------------------ */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const auth = await authenticateApi(req.headers, "write");
  if (!auth.ok) return auth.response;

  const { taskId } = await params;
  const body = await readJson(req);
  const content = body?.content;
  if (typeof content !== "string") return apiError(400, '"content" must be a string.');

  const result = await addTaskNote(auth.caller, taskId, content);
  if (!result.success) return apiError(400, result.error);
  return NextResponse.json({ noteId: result.noteId }, { status: 201 });
}
