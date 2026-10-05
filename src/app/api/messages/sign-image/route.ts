import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { cloudinary } from "@/lib/cloudinary";
import { adminDb } from "@/lib/firebase/admin";
import { getServerSession } from "@/lib/auth/session";
import { resolveChatImageLimit } from "@/lib/auth/permissions";
import { canPostToConversation } from "@/lib/messages/access";
import {
  HARD_MAX_EDGE_PX,
  admitChatImage,
  chatImageAllowance,
  chatImageFolder,
  readChatImageUsage,
} from "@/lib/messages/image-ceiling";
import { conversationIdSchema } from "@/lib/validations/messages";

/* ------------------------------------------------------------------ */
/*  Chat image upload signature                                        */
/*                                                                     */
/*  Separate from the project and vault signers because the folder    */
/*  here is derived from the CONVERSATION — the caller's own org and a */
/*  thread they may post in — never from the request body. A folder   */
/*  taken from the client is a path another workspace's pictures can  */
/*  be written into.                                                   */
/*                                                                     */
/*  The `public_id` is chosen here and signed, so the client cannot    */
/*  pick one. That is what lets `sendImageMessageAction` treat the id  */
/*  the browser echoes back as a claim it can check with a prefix      */
/*  rather than a lookup: an id outside `chat/{org}/{thread}/` was     */
/*  never signed, and Cloudinary would have refused the upload.        */
/*                                                                     */
/*  The quota check is a courtesy, not the enforcement. Nothing is     */
/*  reserved between signing and sending, so two pastes at once can   */
/*  both be signed; the action settles admission inside a transaction */
/*  and is the only authority on it. Checking here just means a        */
/*  workspace that is already out finds out before pushing 10MB over  */
/*  the wire rather than after.                                        */
/* ------------------------------------------------------------------ */

// firebase-admin is Node-only; it cannot run on the Edge runtime.
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const userSnap = await adminDb.collection("users").doc(session.uid).get();
    if (!userSnap.exists) {
      return NextResponse.json({ error: "User not found." }, { status: 403 });
    }
    const user = userSnap.data()!;
    const orgId = user.orgId as string | undefined;
    if (!orgId) {
      return NextResponse.json({ error: "You do not belong to a workspace." }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const parsedId = conversationIdSchema.safeParse(body?.conversationId);
    if (!parsedId.success) {
      return NextResponse.json({ error: "Invalid conversation." }, { status: 400 });
    }
    const conversationId = parsedId.data;
    const size = Number(body?.size);
    const type = typeof body?.type === "string" ? body.type : "";

    /* ── May this person post here at all? ── */
    const conversationSnap = await adminDb.collection("conversations").doc(conversationId).get();
    if (!conversationSnap.exists) {
      return NextResponse.json({ error: "That conversation no longer exists." }, { status: 404 });
    }
    const conversation = conversationSnap.data()!;

    const decision = canPostToConversation({
      type: conversation.type,
      conversationOrgId: (conversation.orgId as string) ?? "",
      participantIds: (conversation.participantIds as string[]) ?? [],
      viewerUid: session.uid,
      viewerOrgId: orgId,
      viewerRole: (user.role as string) || "MEMBER",
    });
    if (!decision.allowed) {
      return NextResponse.json({ error: decision.message }, { status: 403 });
    }

    /* ── Room check ── */
    const orgSnap = await adminDb.collection("organizations").doc(orgId).get();
    const admission = admitChatImage({
      size,
      type,
      usedImages: readChatImageUsage(orgSnap.data()).images,
      maxImages: chatImageAllowance(await resolveChatImageLimit(orgId)),
    });
    if (!admission.allowed) {
      return NextResponse.json({ error: admission.error }, { status: 413 });
    }

    /* ── Signature ── */
    const timestamp = Math.round(Date.now() / 1000);
    const publicId = `${chatImageFolder(orgId, conversationId)}/${randomBytes(12).toString("base64url")}`;

    /* An incoming transformation, signed, so it applies whatever the
       client sends: the stored copy never has an edge longer than the
       ceiling. Every param here has to be echoed exactly by the upload
       or Cloudinary refuses the signature — which is the point. */
    const transformation = `c_limit,w_${HARD_MAX_EDGE_PX},h_${HARD_MAX_EDGE_PX}`;

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
    console.error("[Messages] Error generating image upload signature:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
