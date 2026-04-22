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

    if (!userData || !["OWNER", "owner", "MEMBER", "member"].includes(userData.role)) {
      return { hasAccess: false, error: "Access denied. Valid operational role required." };
    }

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

/**
 * Validates if a user exists and holds the OWNER role in their organization.
 */
export async function validateOwner(userId: string) {
  try {
    const userDoc = await adminDb.collection("users").doc(userId).get();
    if (!userDoc.exists) {
      return { isOwner: false, error: "User not found" };
    }
    const userData = userDoc.data();
    if (!userData || !userData.orgId) {
      return { isOwner: false, error: "User lacks organization assignment" };
    }
    
    // Explicit check for OWNER mapping
    if (userData.role !== "OWNER" && userData.role !== "owner") {
      return { isOwner: false, error: "Unauthorized. Requires OWNER operations clearance." };
    }
    
    return { isOwner: true, orgId: userData.orgId };
  } catch (error) {
    console.error("Error validating owner status:", error);
    return { isOwner: false, error: "Internal server error during authorization" };
  }
}
