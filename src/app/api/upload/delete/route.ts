import { NextRequest, NextResponse } from "next/server";
import { cloudinary } from "@/lib/cloudinary";
import { adminAuth } from "@/lib/firebase/admin";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const idToken = authHeader.split("Bearer ")[1];
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const uid = decodedToken.uid;

    if (!uid) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const { publicId } = await req.json();

    if (!publicId) {
      return NextResponse.json({ error: "Public ID is required" }, { status: 400 });
    }

    // Security check: Ensure publicId starts with the user's uid folder
    // This prevents users from deleting other users' images
    if (!publicId.startsWith(`profile-pictures/${uid}/`)) {
      return NextResponse.json({ error: "Unauthorized access to resource" }, { status: 403 });
    }

    const result = await cloudinary.uploader.destroy(publicId);

    if (result.result !== "ok" && result.result !== "not found") {
      return NextResponse.json({ error: "Failed to delete from Cloudinary", details: result }, { status: 500 });
    }

    return NextResponse.json({ message: "Successfully deleted", status: result.result });
  } catch (error) {
    console.error("Error deleting Cloudinary image:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
