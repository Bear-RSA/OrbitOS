import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { sendDailyDigest } from "@/lib/email/daily-digest";
import { Timestamp } from "firebase-admin/firestore";

export async function POST(req: NextRequest) {
  // Auth check for cron — basic secret check
  const authHeader = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Get all orgs
    const orgsSnap = await adminDb.collection("organizations").get();
    const results: string[] = [];

    for (const orgDoc of orgsSnap.docs) {
      const org = orgDoc.data();
      const orgId = orgDoc.id;

      // Get owner
      const usersSnap = await adminDb
        .collection("users")
        .where("orgId", "==", orgId)
        .where("role", "==", "owner")
        .limit(1)
        .get();

      if (usersSnap.empty) continue;
      const owner = usersSnap.docs[0].data();

      // Get tasks
      const tasksSnap = await adminDb
        .collection("tasks")
        .where("orgId", "==", orgId)
        .get();

      const tasks = tasksSnap.docs.map((d) => d.data());
      const now = new Date();
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const fortyEightHoursAgo = new Date(now);
      fortyEightHoursAgo.setHours(fortyEightHoursAgo.getHours() - 48);

      const overdueCount = tasks.filter(
        (t) => t.status !== "done" && t.dueDate && t.dueDate.toDate() < now
      ).length;

      const inactiveCount = tasks.filter(
        (t) =>
          t.status === "doing" &&
          t.lastUpdatedAt &&
          t.lastUpdatedAt.toDate() < fortyEightHoursAgo
      ).length;

      const yesterdayCompleted = tasks.filter((t) => {
        if (t.status !== "done" || !t.completedAt) return false;
        const completed = t.completedAt.toDate();
        return completed >= yesterday && completed < now;
      }).length;

      // Project risk
      const project = await adminDb
        .collection("projects")
        .where("orgId", "==", orgId)
        .limit(1)
        .get();

      const projectName = project.empty ? null : project.docs[0].data().name;
      const totalTasks = tasks.filter((t) => t.status !== "done").length;
      const overduePercent = totalTasks > 0 ? overdueCount / totalTasks : 0;
      let atRiskStatus: "watch" | "at-risk" | null = null;
      if (overduePercent > 0.25) atRiskStatus = "at-risk";
      else if (overduePercent > 0) atRiskStatus = "watch";

      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://orbitos.app";

      await sendDailyDigest({
        ownerName: owner.name,
        ownerEmail: owner.email,
        orgName: org.name,
        overdueCount,
        inactiveCount,
        atRiskProjectName: atRiskStatus ? projectName : null,
        atRiskStatus,
        overduePercent,
        yesterdayCompleted,
        dashboardUrl: `${appUrl}/dashboard`,
      });

      results.push(`Sent digest to ${owner.email}`);
    }

    return NextResponse.json({ success: true, results });
  } catch (err) {
    console.error("Digest error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// Vercel cron: GET handler
export async function GET(req: NextRequest) {
  return POST(req);
}
