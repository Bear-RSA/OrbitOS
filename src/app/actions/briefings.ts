"use server";

import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { logActivity } from "@/lib/telemetry";
import { requireCaller } from "@/lib/auth/caller";

/* ------------------------------------------------------------------ */
/*  Briefing write path                                                */
/*                                                                     */
/*  The author used to arrive in the payload. The org check below read */
/*  that same claimed uid, so it compared the project against whatever */
/*  workspace the caller said they were in — which any signed-in user  */
/*  could satisfy by naming a member of the target org, and then post  */
/*  a briefing into that project under that person's name.             */
/* ------------------------------------------------------------------ */

export async function sendBriefingAction(payload: {
  projectId: string;
  milestoneId: string;
  content: string;
}) {
  const { projectId, milestoneId, content } = payload;

  try {
    const caller = await requireCaller();
    if (!caller.ok) {
      return { success: false, error: caller.error };
    }
    const { uid } = caller;

    // Check project mapping validation
    const projectSnap = await adminDb.collection("projects").doc(projectId).get();
    if (!projectSnap.exists) {
      return { success: false, error: "Project not found." };
    }
    const projectData = projectSnap.data()!;
    if (projectData.orgId !== caller.orgId) {
      return { success: false, error: "Unauthorized access to project briefings." };
    }

    // Only for the avatar — name and org come from the verified caller.
    const userSnap = await adminDb.collection("users").doc(uid).get();

    // Insert briefing
    const newDoc = adminDb.collection("briefings").doc();
    await newDoc.set({
      projectId,
      milestoneId,
      author: {
        uid,
        name: caller.name,
        photoURL: userSnap.data()?.photoURL || null
      },
      content,
      timestamp: FieldValue.serverTimestamp()
    });

    // Telemetry integration: trigger a 'BRIEFING_POSTED' log
    await logActivity({
      eventType: "BRIEFING_POSTED" as any,
      orgId: caller.orgId,
      projectId: projectId,
      actor: { uid, name: caller.name },
      metadata: { briefingId: newDoc.id, milestone: milestoneId, contentPreview: content.substring(0, 50) }
    });

    return { success: true, id: newDoc.id };
  } catch (error) {
    console.error("Failed to send briefing:", error);
    return { success: false, error: "System failure while posting briefing" };
  }
}
