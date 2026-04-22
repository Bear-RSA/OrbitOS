"use server";

import { adminDb } from "@/lib/firebase/admin";

export interface RoadmapItem {
  id: string;
  title: string;
  shortId: string;
  status: string;
  startDateMs: number;
  horizonDateMs: number;
  isExecuted: boolean;
}

export async function getRoadmapAction(projectId: string) {
  try {
    const tasksSnap = await adminDb
      .collection("tasks")
      .where("projectId", "==", projectId)
      .get();

    const roadmap: RoadmapItem[] = [];

    tasksSnap.forEach((doc) => {
      const data = doc.data();
      const start = data.createdAt ? data.createdAt.toDate().getTime() : Date.now();
      const end = data.dueDate ? data.dueDate.toDate().getTime() : start + 7 * 24 * 60 * 60 * 1000;
      
      roadmap.push({
        id: doc.id,
        title: data.title || "Untitled Directive",
        shortId: doc.id.slice(0, 4).toUpperCase(),
        status: data.status,
        isExecuted: data.status === "done",
        startDateMs: start,
        horizonDateMs: end,
      });
    });

    roadmap.sort((a, b) => a.startDateMs - b.startDateMs);

    return { success: true, data: roadmap };
  } catch (error) {
    console.error("Failed to load roadmap:", error);
    return { success: false, error: "System error compiling roadmap data" };
  }
}
