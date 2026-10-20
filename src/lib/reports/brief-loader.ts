import { Timestamp } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebase/admin";
import { dueDateKeyOf } from "@/lib/utils/dates";
import { sastDayKey } from "@/lib/utils/sast";
import {
  buildAttention,
  buildMyWeek,
  type AttentionBrief,
  type BriefMeeting,
  type BriefTask,
  type MyWeekBrief,
} from "./briefs";
import { buildHealthReport, type HealthReport } from "./health-report";
import { toReportTask } from "./monthly-run";

/* ------------------------------------------------------------------ */
/*  Brief loader                                                       */
/*                                                                     */
/*  The reads behind the API's reports. Kept apart from the builders   */
/*  so those stay pure. Every query is a single equality on a field    */
/*  that already has an index, or the deployed (orgId, startAt) one.   */
/* ------------------------------------------------------------------ */

const DAY_MS = 86_400_000;

function millisOf(value: unknown): number | null {
  return value instanceof Timestamp ? value.toMillis() : null;
}

function toBriefTask(doc: FirebaseFirestore.QueryDocumentSnapshot): BriefTask {
  const data = doc.data();
  return {
    id: doc.id,
    title: typeof data.title === "string" ? data.title : "",
    projectId: typeof data.projectId === "string" ? data.projectId : "",
    status: data.status === "done" || data.status === "doing" ? data.status : "todo",
    assignedTo: Array.isArray(data.assignedTo)
      ? data.assignedTo.filter((uid: unknown): uid is string => typeof uid === "string")
      : [],
    dueDateKey: dueDateKeyOf(data),
    isBlocked: Boolean(data.isBlocked),
    blockedReason: data.isBlocked ? (data.blockedReason as string) || null : null,
    completedAtMs: millisOf(data.completedAt),
    lastUpdatedMs: millisOf(data.lastUpdatedAt ?? data.updatedAt),
  };
}

/** Live (not archived) project names, and everyone's display name. */
async function loadLookups(orgId: string) {
  const [projectsSnap, usersSnap] = await Promise.all([
    adminDb.collection("projects").where("orgId", "==", orgId).get(),
    adminDb.collection("users").where("orgId", "==", orgId).get(),
  ]);
  return {
    projectDocs: projectsSnap.docs,
    userDocs: usersSnap.docs,
    projects: new Map(
      projectsSnap.docs
        .filter((doc) => !doc.data().archived)
        .map((doc) => [doc.id, (doc.data().name as string) || "Untitled project"])
    ),
    people: new Map(
      usersSnap.docs.map((doc) => [doc.id, (doc.data().name as string) || "Unnamed member"])
    ),
  };
}

export async function loadMyWeek(caller: { uid: string; orgId: string }): Promise<MyWeekBrief> {
  const now = Date.now();

  const [tasksSnap, eventsSnap, lookups] = await Promise.all([
    adminDb.collection("tasks").where("assignedTo", "array-contains", caller.uid).get(),
    adminDb
      .collection("events")
      .where("orgId", "==", caller.orgId)
      .where("startAt", ">=", Timestamp.fromMillis(now - DAY_MS))
      .where("startAt", "<", Timestamp.fromMillis(now + 7 * DAY_MS))
      .get(),
    loadLookups(caller.orgId),
  ]);

  const tasks = tasksSnap.docs
    .filter((doc) => doc.data().orgId === caller.orgId)
    .map(toBriefTask)
    .filter((task) => lookups.projects.has(task.projectId));

  const meetings: BriefMeeting[] = eventsSnap.docs
    .filter((doc) => {
      const data = doc.data();
      return data.status !== "cancelled" && ((data.attendees ?? []) as string[]).includes(caller.uid);
    })
    .map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        title: (data.title as string) || "",
        startMs: millisOf(data.startAt) ?? 0,
        endMs: millisOf(data.endAt) ?? 0,
        meetingUrl: (data.meetingUrl as string | null) ?? null,
      };
    });

  return buildMyWeek({
    todayKey: sastDayKey(new Date(now)),
    nowMs: now,
    tasks,
    meetings,
    projects: lookups.projects,
    people: lookups.people,
  });
}

/** What is slipping across the workspace, or within one project. */
export async function loadAttention(
  caller: { orgId: string },
  projectId?: string
): Promise<AttentionBrief> {
  const now = Date.now();
  const [tasksSnap, lookups] = await Promise.all([
    projectId
      ? adminDb.collection("tasks").where("projectId", "==", projectId).get()
      : adminDb.collection("tasks").where("orgId", "==", caller.orgId).get(),
    loadLookups(caller.orgId),
  ]);

  const tasks = tasksSnap.docs
    .filter((doc) => doc.data().orgId === caller.orgId)
    .map(toBriefTask);

  return buildAttention({
    todayKey: sastDayKey(new Date(now)),
    nowMs: now,
    tasks,
    projects: lookups.projects,
    people: lookups.people,
  });
}

/**
 * The monthly health numbers for any month, on demand — the same figures
 * the owners' monthly mail carries. Defaults to the month so far.
 */
export async function loadMonthReport(
  caller: { orgId: string },
  monthKey?: string
): Promise<HealthReport> {
  const key = monthKey ?? sastDayKey(new Date()).slice(0, 7);
  const [tasksSnap, lookups] = await Promise.all([
    adminDb.collection("tasks").where("orgId", "==", caller.orgId).get(),
    loadLookups(caller.orgId),
  ]);

  return buildHealthReport({
    monthKey: key,
    tasks: tasksSnap.docs.map((doc) => toReportTask(doc.data())),
    projects: lookups.projectDocs.map((doc) => ({
      id: doc.id,
      name: (doc.data().name as string) || "Untitled project",
      archived: Boolean(doc.data().archived),
    })),
    people: lookups.userDocs.map((doc) => ({
      uid: doc.id,
      name: (doc.data().name as string) || "Unnamed member",
    })),
  });
}
