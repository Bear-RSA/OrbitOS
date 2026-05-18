import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { verifyProjectAccess } from "@/lib/auth/permissions";
import { FieldValue } from "firebase-admin/firestore";

/**
 * @deprecated Favor using the Cloudinary Webhook ingestion system (/api/webhooks/cloudinary).
 * This endpoint is kept for backward compatibility with existing client-side logic.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    console.warn("DEPRECATED: Client-side metadata submission called for project", projectId);
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const idToken = authHeader.split("Bearer ")[1];
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const uid = decodedToken.uid;

    // projectId already destructured above
    const fileData = await req.json();

    // Basic structure validation
    if (!fileData.name || !fileData.url || !fileData.publicId) {
      return NextResponse.json({ error: "Missing file metadata" }, { status: 400 });
    }

    // Verify user has access to this project
    const { hasAccess, error } = await verifyProjectAccess(uid, projectId);
    if (!hasAccess) {
      return NextResponse.json({ error }, { status: 403 });
    }

    // Save metadata to Firestore subcollection: projects/{projectId}/files
    const fileRef = adminDb.collection("projects").doc(projectId).collection("files").doc();
    
    const projectFile = {
      id: fileRef.id,
      projectId,
      name: fileData.name,
      url: fileData.url,
      publicId: fileData.publicId,
      size: fileData.size || 0,
      type: fileData.type || "unknown",
      uploadedBy: uid,
      createdAt: FieldValue.serverTimestamp(),
    };

    await fileRef.set(projectFile);

    return NextResponse.json({ 
      success: true, 
      file: {
        ...projectFile,
        createdAt: new Date().toISOString() // Return ISO string for client
      } 
    });
  } catch (error) {
    console.error("Error saving project file metadata:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
