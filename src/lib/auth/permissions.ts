import { adminDb } from "@/lib/firebase/admin";

/**
 * Verifies if a user has access to a project.
 * A user has access if they belong to the same organization as the project.
 */
export async function verifyProjectAccess(userId: string, projectId: string) {
  try {
    // 1. Get project
    const projectDoc = await adminDb.collection("projects").doc(projectId).get();
    if (!projectDoc.exists) {
      return { hasAccess: false, error: "Project not found" };
    }
    const projectData = projectDoc.data();
    const projectOrgId = projectData?.orgId;

    // 2. Get user
    const userDoc = await adminDb.collection("users").doc(userId).get();
    if (!userDoc.exists) {
      return { hasAccess: false, error: "User not found" };
    }
    const userData = userDoc.data();
    const userOrgId = userData?.orgId;

    // 3. Compare org IDs
    if (projectOrgId && userOrgId && projectOrgId === userOrgId) {
      return { hasAccess: true, orgId: projectOrgId };
    }

    return { hasAccess: false, error: "Unauthorized access to project" };
  } catch (error) {
    console.error("Error verifying project access:", error);
    return { hasAccess: false, error: "Internal server error" };
  }
}
