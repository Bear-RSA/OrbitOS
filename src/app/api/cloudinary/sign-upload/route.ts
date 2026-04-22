import { NextRequest, NextResponse } from "next/server";
import { cloudinary } from "@/lib/cloudinary";
import { adminAuth } from "@/lib/firebase/admin";
import { verifyProjectAccess } from "@/lib/auth/permissions";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const idToken = authHeader.split("Bearer ")[1];
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const uid = decodedToken.uid;

    const { projectId, folder, name, type } = await req.json();

    if (!projectId) {
      return NextResponse.json({ error: "Project ID is required" }, { status: 400 });
    }

    // Verify user has access to this project
    const { hasAccess, error } = await verifyProjectAccess(uid, projectId);
    if (!hasAccess) {
      return NextResponse.json({ error }, { status: 403 });
    }

    const timestamp = Math.round(new Date().getTime() / 1000);
    const uploadFolder = folder || `projects/${projectId}/assets`;
    
    // Generate signature for signed upload
    const paramsToSign = {
      timestamp,
      folder: uploadFolder,
    };

    const signature = cloudinary.utils.api_sign_request(
      paramsToSign,
      process.env.CLOUDINARY_API_SECRET!
    );

    // Dynamically determine resource_type based on file extension or type
    let resource_type = "auto";
    if (name) {
      const lowerName = name.toLowerCase();
      if (/\.(zip|rar|7z|tar|gz)$/i.test(lowerName)) {
        resource_type = "raw";
      } else if (type?.startsWith("image/") || /\.(png|jpg|jpeg|gif|svg|webp)$/i.test(lowerName)) {
        resource_type = "image";
      } else if (type?.startsWith("video/") || /\.(mp4|mov|webm|avi)$/i.test(lowerName)) {
        resource_type = "video";
      }
    }

    return NextResponse.json({
      timestamp,
      signature,
      apiKey: process.env.CLOUDINARY_API_KEY,
      cloudName: process.env.CLOUDINARY_CLOUD_NAME,
      folder: uploadFolder,
      resource_type,
    });
  } catch (error) {
    console.error("Error generating Cloudinary signature:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
