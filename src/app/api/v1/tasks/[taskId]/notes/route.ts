import { NextResponse } from "next/server";

import { apiError, apiRoute } from "@/lib/api/request";
import { addTaskNote } from "@/lib/tasks/core";

/* ------------------------------------------------------------------ */
/*  POST /api/v1/tasks/:id/notes — add a note                          */
/*                                                                     */
/*  How an assistant reports back on work it did: the result goes on   */
/*  the task as a note, under the token owner's name.                  */
/* ------------------------------------------------------------------ */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = apiRoute<{ taskId: string }>(
  { scope: "write", kind: "write" },
  async ({ caller, params, body }) => {
    const content = body?.content;
    if (typeof content !== "string") return apiError(400, '"content" must be a string.');

    const result = await addTaskNote(caller, params.taskId, content);
    if (!result.success) return apiError(400, result.error);
    return NextResponse.json({ noteId: result.noteId }, { status: 201 });
  }
);
