import { NextRequest, NextResponse } from "next/server";

import { apiError, authenticateApi, readJson } from "@/lib/api/request";
import { capListLimit } from "@/lib/api/ceiling";
import {
  FieldError,
  optionalDateKey,
  optionalString,
  optionalStringArray,
} from "@/lib/api/fields";
import { createTask, isTaskStatus, listTasks } from "@/lib/tasks/core";

/* ------------------------------------------------------------------ */
/*  GET  /api/v1/tasks — tasks, assigned to the caller by default      */
/*  POST /api/v1/tasks — create a task                                 */
/* ------------------------------------------------------------------ */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await authenticateApi(req.headers, "read");
  if (!auth.ok) return auth.response;
  const { caller } = auth;

  const params = req.nextUrl.searchParams;
  const status = params.get("status") ?? undefined;
  if (status !== undefined && !isTaskStatus(status)) {
    return apiError(400, '"status" must be todo, doing, or done.');
  }

  const tasks = await listTasks(caller, {
    assignee: params.get("assignee") ?? "me",
    status,
    projectId: params.get("projectId") ?? undefined,
    openOnly: params.get("includeDone") !== "true",
    limit: capListLimit(params.get("limit") ?? undefined),
  });

  return NextResponse.json({ tasks });
}

export async function POST(req: NextRequest) {
  const auth = await authenticateApi(req.headers, "write");
  if (!auth.ok) return auth.response;

  const body = await readJson(req);
  if (!body) return apiError(400, "Send a JSON object.");

  try {
    const result = await createTask(auth.caller, {
      projectId: optionalString(body, "projectId", 100) ?? "",
      title: optionalString(body, "title", 200) ?? "",
      description: optionalString(body, "description"),
      assignedTo: optionalStringArray(body, "assignedTo"),
      milestone: optionalString(body, "milestone", 100),
      dueDate: optionalDateKey(body, "dueDate"),
    });
    if (!result.success) return apiError(400, result.error);
    return NextResponse.json({ taskId: result.taskId }, { status: 201 });
  } catch (err) {
    if (err instanceof FieldError) return apiError(400, err.message);
    throw err;
  }
}
