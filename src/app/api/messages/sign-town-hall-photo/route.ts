import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { cloudinary } from "@/lib/cloudinary";
import { adminDb } from "@/lib/firebase/admin";
import { getServerSession } from "@/lib/auth/session";
import { canManageTownHall } from "@/lib/messages/access";
import { townHallConversationId } from "@/lib/messages/conversation-id";
import { isChatImageType, withinImageCeiling } from "@/lib/messages/image-ceiling";
import { TOWN_HALL_PHOTO_EDGE_PX, townHallPhotoFolder } from "@/lib/messages/town-hall";

/* ------------------------------------------------------------------ */
/*  Town Hall picture upload signature                                 */
/*                                                                     */
/*  Owners only. The folder comes from the caller's org and the id is  */
/*  chosen here, so `updateTownHallProfileAction` can check the id the */
/*  browser echoes back by prefix — see `lib/messages/town-hall`.      */
/* ------------------------------------------------------------------ */

// firebase-admin is Node-only; it cannot run on the Edge runtime.
export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const userSnap = await adminDb.collection("users").doc(session.uid).get();
    const user = userSnap.data();
    const orgId = user?.orgId as string | undefined;
    if (!orgId) {
      return NextResponse.json({ error: "You do not belong to a workspace." }, { status: 403 });
    }

    const decision = canManageTownHall({
      type: "townhall",
      conversationOrgId: orgId,
      participantIds: [],
      viewerUid: session.uid,
      viewerOrgId: orgId,
      viewerRole: (user?.role as string) || "MEMBER",
    });
    if (!decision.allowed) {
      return NextResponse.json({ error: decision.message }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const type = typeof body?.type === "string" ? body.type : "";
    if (!isChatImageType(type)) {
      return NextResponse.json(
        { error: "Use a PNG, JPEG, WebP or GIF picture." },
        { status: 415 }
      );
    }
    if (!withinImageCeiling(Number(body?.size))) {
      return NextResponse.json({ error: "That picture is too large." }, { status: 413 });
    }

    /* Make sure there is a Town Hall to put it on. Cheap, and it turns a
       later "conversation not found" into nothing at all. */
    const exists = (
      await adminDb.collection("conversations").doc(townHallConversationId(orgId)).get()
    ).exists;
    if (!exists) {
      return NextResponse.json({ error: "Open Town Hall first." }, { status: 404 });
    }

    const timestamp = Math.round(Date.now() / 1000);
    const publicId = `${townHallPhotoFolder(orgId)}/${randomBytes(12).toString("base64url")}`;
    const transformation = `c_fill,g_auto,w_${TOWN_HALL_PHOTO_EDGE_PX},h_${TOWN_HALL_PHOTO_EDGE_PX}`;

    const signature = cloudinary.utils.api_sign_request(
      { timestamp, public_id: publicId, transformation },
      process.env.CLOUDINARY_API_SECRET!
    );

    return NextResponse.json({
      timestamp,
      signature,
      apiKey: process.env.CLOUDINARY_API_KEY,
      cloudName: process.env.CLOUDINARY_CLOUD_NAME,
      publicId,
      transformation,
    });
  } catch (error) {
    console.error("[TownHall] Error signing picture upload:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
