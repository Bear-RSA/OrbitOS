import { NextRequest, NextResponse } from "next/server";
import { cloudinary } from "@/lib/cloudinary";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { resolveVaultLimits } from "@/lib/auth/permissions";
import { readVaultUsage } from "@/lib/vault/access";
import {
  admitVaultUpload,
  vaultDocumentAllowance,
  vaultStorageAllowance,
} from "@/lib/vault/ceiling";
import { isVaultCategory, DEFAULT_VAULT_CATEGORY } from "@/types/vault";

/* ------------------------------------------------------------------ */
/*  Vault upload signature                                             */
/*                                                                     */
/*  Separate from `/api/cloudinary/sign-upload` because that one signs  */
/*  against a project the caller belongs to, and the Vault has no       */
/*  project. The folder here is derived from the caller's OWN org,      */
/*  never from the request body — a folder taken from the client is a   */
/*  path another workspace's records can be written into.               */
/*                                                                     */
/*  The quota check below is a courtesy, not the enforcement. Nothing   */
/*  is reserved between signing and registering, so two uploads started */
/*  at once can both be signed; `registerVaultDocumentAction` settles   */
/*  admission inside a transaction and is the only authority on it.     */
/*  Checking here just means a workspace that is already full finds out */
/*  before pushing 100MB over the wire rather than after.               */
/* ------------------------------------------------------------------ */

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const idToken = authHeader.split("Bearer ")[1];
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const uid = decodedToken.uid;

    const userSnap = await adminDb.collection("users").doc(uid).get();
    if (!userSnap.exists) {
      return NextResponse.json({ error: "User not found" }, { status: 403 });
    }

    const userData = userSnap.data()!;
    const orgId = userData.orgId as string | undefined;
    const role = (userData.role as string) || "MEMBER";

    if (!orgId) {
      return NextResponse.json(
        { error: "You do not belong to a workspace." },
        { status: 403 }
      );
    }

    if (!["OWNER", "MEMBER"].includes(role.toUpperCase())) {
      return NextResponse.json(
        { error: "Access denied. Valid operational role required." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const size = Number(body?.size);
    const type = typeof body?.type === "string" ? body.type : "";
    const category = isVaultCategory(body?.category)
      ? body.category
      : DEFAULT_VAULT_CATEGORY;

    /* ── Room check ── */
    const orgSnap = await adminDb.collection("organizations").doc(orgId).get();
    const usage = readVaultUsage(orgSnap.data());
    const tier = await resolveVaultLimits(orgId);

    const admission = admitVaultUpload({
      size,
      usedBytes: usage.bytes,
      usedDocuments: usage.documents,
      maxBytes: vaultStorageAllowance(tier.maxStorageMb),
      maxDocuments: vaultDocumentAllowance(tier.maxDocuments),
    });

    if (!admission.allowed) {
      return NextResponse.json({ error: admission.error }, { status: 413 });
    }

    /* ── Signature ── */
    const timestamp = Math.round(Date.now() / 1000);
    const folder = `vault/${orgId}/${category}`;

    /* Vault assets are uploaded as `authenticated`, not with Cloudinary's
       default public `upload` type, and that single word is what makes
       this a vault rather than a folder.

       A public asset is served to anyone who has its URL, forever, with
       no reference to Firestore — so a clearance enforced only in our
       rules would be a label on a document that is already readable by
       the internet. An authenticated asset is refused unless the request
       carries a signature this server produced, which puts every read
       back through `getVaultDownloadUrlAction` and its clearance check.

       Every downstream call has to name the type too: an unsigned
       delivery URL, a destroy, or a download link built without it
       addresses the public namespace, where these assets are not. */
    const deliveryType = "authenticated";

    const signature = cloudinary.utils.api_sign_request(
      { timestamp, folder, type: deliveryType },
      process.env.CLOUDINARY_API_SECRET!
    );

    /* The Vault takes every kind of file, so the resource type is chosen
       the way the project repository chose it: images and video use the
       native Cloudinary types, and everything else — PDFs, spreadsheets,
       archives, CAD, files with no extension at all — goes up as "raw",
       which is the only type that will not reject an unknown format. */
    let resource_type = "raw";
    if (type.startsWith("image/")) resource_type = "image";
    else if (type.startsWith("video/")) resource_type = "video";

    return NextResponse.json({
      timestamp,
      signature,
      apiKey: process.env.CLOUDINARY_API_KEY,
      cloudName: process.env.CLOUDINARY_CLOUD_NAME,
      folder,
      resource_type,
      type: deliveryType,
    });
  } catch (error) {
    console.error("[Vault] Error generating upload signature:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
