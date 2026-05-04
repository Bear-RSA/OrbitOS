import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";

export async function GET(req: NextRequest) {
  try {
    // 1. Test basic admin read
    const tasksSnap = await adminDb.collection("tasks").limit(1).get();
    const taskCount = tasksSnap.size;
    const firstTask = tasksSnap.docs[0];
    
    if (!firstTask) {
      return NextResponse.json({ status: "no_tasks", message: "No tasks found to test." });
    }

    const taskData = firstTask.data();
    
    return NextResponse.json({
      status: "admin_sdk_working",
      taskId: firstTask.id,
      taskTitle: taskData.title,
      taskOrgId: taskData.orgId,
      message: "Admin SDK can read tasks successfully. The delete operation should work.",
    });
  } catch (err: any) {
    return NextResponse.json({
      status: "admin_sdk_error",
      error: err.message,
      code: err.code,
      stack: err.stack?.split("\n").slice(0, 5),
    }, { status: 500 });
  }
}
