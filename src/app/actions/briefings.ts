"use server";

import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { logActivity } from "@/lib/telemetry";

export async function sendBriefingAction(payload: {
  projectId: string;
  milestoneId: string;
  uid: string;
  content: string;
}) {
  const { projectId, milestoneId, uid, content } = payload;
  
  try {
    const userSnap = await adminDb.collection("users").doc(uid).get();
    if (!userSnap.exists) {
      return { success: false, error: "User not found." };
    }
    const userData = userSnap.data()!;
    
    // Check project mapping validation
    const projectSnap = await adminDb.collection("projects").doc(projectId).get();
    if (!projectSnap.exists) {
      return { success: false, error: "Project not found." };
    }
    const projectData = projectSnap.data()!;
    if (projectData.orgId !== userData.orgId) {
      return { success: false, error: "Unauthorized access to project briefings." };
    }

    // Insert briefing
    const newDoc = adminDb.collection("briefings").doc();
    await newDoc.set({
      projectId,
      milestoneId,
      author: {
        uid,
        name: userData.name || "System",
        photoURL: userData.photoURL || null
      },
      content,
      timestamp: FieldValue.serverTimestamp()
    });

    // Telemetry integration: trigger a 'BRIEFING_POSTED' log
    await logActivity({
      eventType: "BRIEFING_POSTED" as any,
      orgId: userData.orgId,
      projectId: projectId,
      actor: { uid, name: userData.name || "System" },
      metadata: { briefingId: newDoc.id, milestone: milestoneId, contentPreview: content.substring(0, 50) }
    });

    return { success: true, id: newDoc.id };
  } catch (error) {
    console.error("Failed to send briefing:", error);
    return { success: false, error: "System failure while posting briefing" };
  }
}
