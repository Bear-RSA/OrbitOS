import { NextRequest, NextResponse } from "next/server";

import { apiError, authenticateApi, readJson } from "@/lib/api/request";
import {
  FieldError,
  optionalBoolean,
  optionalDateKey,
  optionalString,
  optionalStringArray,
} from "@/lib/api/fields";
import {
  getTask,
  isTaskStatus,
  setTaskBlocked,
  setTaskStatus,
  updateTask,
  type UpdateTaskFields,
} from "@/lib/tasks/core";

/* ------------------------------------------------------------------ */
/*  GET   /api/v1/tasks/:id — one task with its notes                  */
/*  PATCH /api/v1/tasks/:id — edit fields, move status, block/unblock  */
/*                                                                     */
/*  No DELETE. An assistant that misreads an instruction should not   */
/*  be able to lose anybody's work; deleting stays a click in the app. */
/* ------------------------------------------------------------------ */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ taskId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const auth = await authenticateApi(req.headers, "read");
  if (!auth.ok) return auth.response;

  const { taskId } = await params;
  const result = await getTask(auth.caller, taskId);
  if (!result.success) return apiError(404, result.error);
  return NextResponse.json({ task: result.task });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await authenticateApi(req.headers, "write");
  if (!auth.ok) return auth.response;
  const { caller } = auth;

  const { taskId } = await params;
  const body = await readJson(req);
  if (!body) return apiError(400, "Send a JSON object.");

  try {
    const status = body.status;
    if (status !== undefined && !isTaskStatus(status)) {
      return apiError(400, '"status" must be todo, doing, or done.');
    }
    const isBlocked = optionalBoolean(body, "isBlocked");
    const blockedReason = optionalString(body, "blockedReason", 500);

    const fields: UpdateTaskFields = {
      title: optionalString(body, "title", 200),
      description: optionalString(body, "description"),
      assignedTo: optionalStringArray(body, "assignedTo"),
      milestone: optionalString(body, "milestone", 100),
      dueDate: optionalDateKey(body, "dueDate"),
    };
    const hasFields = Object.values(fields).some((value) => value !== undefined);

    if (!hasFields && status === undefined && isBlocked === undefined) {
      return apiError(400, "Nothing to change.");
    }

    if (hasFields) {
      const result = await updateTask(caller, taskId, fields);
      if (!result.success) return apiError(400, result.error);
    }
    if (status !== undefined) {
      const result = await setTaskStatus(caller, taskId, status);
      if (!result.success) return apiError(400, result.error);
    }
    if (isBlocked !== undefined) {
      const result = await setTaskBlocked(caller, taskId, isBlocked, blockedReason);
      if (!result.success) return apiError(400, result.error);
    }

    const updated = await getTask(caller, taskId);
    if (!updated.success) return apiError(404, updated.error);
    return NextResponse.json({ task: updated.task });
  } catch (err) {
    if (err instanceof FieldError) return apiError(400, err.message);
    throw err;
  }
}
