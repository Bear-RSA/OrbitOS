"use server";

import { adminDb } from "@/lib/firebase/admin";
import { cloudinary } from "@/lib/cloudinary";
import { logActivity } from "@/lib/telemetry";
import { verifyProjectAccess } from "@/lib/auth/permissions";

/* ------------------------------------------------------------------ */
/*  Signed Download URL                                                */
/* ------------------------------------------------------------------ */

interface SignedDownloadPayload {
  projectId: string;
  publicId: string;
  resourceType: string; // "image" | "video" | "raw"
  uid: string;
}

/**
 * Generates a time-limited, signed Cloudinary download URL.
 * Validates that the requesting user is an OWNER or MEMBER of the
 * project's organization before producing the signature.
 */
export async function getSignedDownloadUrlAction(
  payload: SignedDownloadPayload
): Promise<{ success: boolean; url?: string; error?: string }> {
  const { projectId, publicId, resourceType, uid } = payload;

  try {
    // 1. Verify the user has access to this project (OWNER or MEMBER)
    const { hasAccess, error } = await verifyProjectAccess(uid, projectId);
    if (!hasAccess) {
      console.error("[SignedDownload] Access denied:", { uid, projectId, error });
      return { success: false, error: error || "Access denied." };
    }

    // 2. Determine the Cloudinary resource type
    const resolvedType = (["image", "video", "raw"].includes(resourceType))
      ? resourceType
      : "raw";

    // 3. Build signed URL options
    //    Raw files do NOT support transformations (including fl_attachment),
    //    so only add the attachment flag for image/video resources.
    const urlOptions: Record<string, unknown> = {
      type: "upload",
      resource_type: resolvedType,
      sign_url: true,
      secure: true,
    };

    if (resolvedType === "image" || resolvedType === "video") {
      urlOptions.flags = "attachment";
    }

    const signedUrl = cloudinary.url(publicId, urlOptions);

    return { success: true, url: signedUrl };
  } catch (err) {
    console.error("[SignedDownload] Error generating signed URL:", err);
    return { success: false, error: "Failed to generate download link." };
  }
}

/* ------------------------------------------------------------------ */
/*  File Management                                                    */
/* ------------------------------------------------------------------ */

interface DeleteFilePayload {
  projectId: string;
  fileId: string;
  publicId: string;
  resourceType: string;
  uid: string;
  fileName?: string;
}

interface RegisterFilePayload {
  projectId: string;
  name: string;
  type: string;
  size: number;
  url: string;
  publicId: string;
  uid: string;
}

export async function registerProjectFileAction(
  payload: RegisterFilePayload
): Promise<{ success: boolean; fileId?: string; error?: string }> {
  const { projectId, name, type, size, url, publicId, uid } = payload;

  try {
    const userSnap = await adminDb.collection("users").doc(uid).get();
    if (!userSnap.exists) return { success: false, error: "User not found" };
    const userData = userSnap.data()!;

    const fileRef = await adminDb
      .collection("projects")
      .doc(projectId)
      .collection("files")
      .add({
        name,
        type,
        size,
        url,
        publicId,
        uploadedBy: uid,
        createdAt: new Date(),
      });

    // Log activity
    await logActivity({
      eventType: "ASSET_INGESTED",
      orgId: userData.orgId,
      projectId,
      actor: { uid, name: userData.name || "System" },
      metadata: { fileName: name, fileId: fileRef.id },
    });

    return { success: true, fileId: fileRef.id };
  } catch (err) {
    console.error("[RegisterFile] Error:", err);
    return { success: false, error: "Failed to index asset" };
  }
}

export async function deleteProjectFileAction(
  payload: DeleteFilePayload
): Promise<{ success: boolean; error?: string }> {
  const { projectId, fileId, publicId, resourceType, uid } = payload;

  console.log("[DeleteFile] Deleting asset:", { projectId, fileId, publicId, resourceType, uid });

  try {
    // 1. Validate the authenticated user exists and is an owner
    const userSnap = await adminDb.collection("users").doc(uid).get();
    if (!userSnap.exists) {
      console.error("[DeleteFile] User not found:", uid);
      return { success: false, error: "Authenticated user profile not found." };
    }

    const userData = userSnap.data()!;
    if (!["OWNER", "owner", "MEMBER", "member"].includes(userData.role)) {
      console.error("[DeleteFile] Unauthorized attempted file deletion:", uid, userData.role);
      return { success: false, error: "Only workspace members can delete files." };
    }

    if (!userData.orgId) {
      console.error("[DeleteFile] User has no org:", uid);
      return { success: false, error: "User is not assigned to a workspace." };
    }

    // 2. Validate the project exists and belongs to the user's org
    const projectSnap = await adminDb.collection("projects").doc(projectId).get();
    if (!projectSnap.exists) {
      console.error("[DeleteFile] Project not found:", projectId);
      return { success: false, error: "Project not found." };
    }

    const projectData = projectSnap.data()!;
    if (projectData.orgId !== userData.orgId) {
      console.error("[DeleteFile] Org mismatch:", {
        projectOrg: projectData.orgId,
        userOrg: userData.orgId,
      });
      return { success: false, error: "Project does not belong to your workspace." };
    }

    // 3. Delete the Cloudinary asset (best-effort)
    try {
      // Cloudinary destroy expects resource_type (image, video, raw)
      // Our file.type is "resource_type/format"
      const cResource = resourceType || "image"; 
      
      const cloudResult = await cloudinary.uploader.destroy(publicId, { 
        resource_type: cResource 
      });
      console.log("[DeleteFile] Cloudinary result:", cloudResult);
    } catch (cloudErr) {
      console.warn("[DeleteFile] Cloudinary deletion error (non-blocking):", cloudErr);
    }

    // 4. Delete the Firestore document
    await adminDb
      .collection("projects")
      .doc(projectId)
      .collection("files")
      .doc(fileId)
      .delete();

    console.log("[DeleteFile] ✓ File record deleted:", fileId, "→ project:", projectId);

    // 5. Log activity
    try {
      await logActivity({
        eventType: "ASSET_DESTROYED",
        orgId: userData.orgId,
        projectId,
        actor: { uid, name: userData.name || "System" },
        metadata: { fileName: payload.fileName || "unknown", fileId },
      });
    } catch (telemetryError) {
      console.error("TELEMETRY WRITE ERROR:", telemetryError);
    }

    return { success: true };
  } catch (error: any) {
    console.error("[DeleteFile] Deletion failed:", error);
    return {
      success: false,
      error: "File deletion failed. Please try again.",
    };
  }
}
