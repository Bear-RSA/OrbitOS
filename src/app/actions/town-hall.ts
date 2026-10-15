"use server";

import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { cloudinary } from "@/lib/cloudinary";
import { requireCaller } from "@/lib/auth/caller";
import { canManageTownHall } from "@/lib/messages/access";
import { townHallConversationId } from "@/lib/messages/conversation-id";
import { isTownHallPhotoPublicId } from "@/lib/messages/town-hall";
import {
  MAX_PINNED_NOTICES,
  pinMessageSchema,
  townHallProfileSchema,
} from "@/lib/validations/messages";

/* ------------------------------------------------------------------ */
/*  Town Hall as the company's profile                                 */
/*                                                                     */
/*  Its name, its picture and its pinned notices. All server-written: */
/*  the rules keep these fields out of the keys a client may touch, so */
/*  a Member cannot rename the company's channel or pin a line of      */
/*  their own to the top of it. Every owner may — see                  */
/*  `canManageTownHall`.                                               */
/* ------------------------------------------------------------------ */

type Result = { success: true } | { success: false; error: string };

const CONVERSATIONS = "conversations";

/** The caller's Town Hall, if they may manage it. */
async function loadManagedTownHall() {
  const caller = await requireCaller();
  if (!caller.ok) return { ok: false as const, error: caller.error };

  const ref = adminDb.collection(CONVERSATIONS).doc(townHallConversationId(caller.orgId));
  const snap = await ref.get();
  if (!snap.exists) return { ok: false as const, error: "Open Town Hall first." };

  const data = snap.data()!;
  const decision = canManageTownHall({
    type: data.type,
    conversationOrgId: (data.orgId as string) ?? "",
    participantIds: [],
    viewerUid: caller.uid,
    viewerOrgId: caller.orgId,
    viewerRole: caller.role,
  });
  if (!decision.allowed) return { ok: false as const, error: decision.message };

  return { ok: true as const, caller, ref, data };
}

/** Renames Town Hall and sets, replaces or removes its picture. */
export async function updateTownHallProfileAction(input: unknown): Promise<Result> {
  try {
    const parsed = townHallProfileSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid profile." };
    }
    const { name, photoPublicId } = parsed.data;

    const loaded = await loadManagedTownHall();
    if (!loaded.ok) return { success: false, error: loaded.error };
    const { caller, ref, data } = loaded;

    const update: Record<string, unknown> = { name };
    const previousPublicId = (data.photoPublicId as string | null | undefined) ?? null;

    if (photoPublicId !== undefined) {
      if (photoPublicId !== null && !isTownHallPhotoPublicId(photoPublicId, caller.orgId)) {
        return { success: false, error: "That picture was not uploaded for Town Hall." };
      }
      update.photoPublicId = photoPublicId;
      update.photoURL = photoPublicId
        ? cloudinary.url(photoPublicId, {
            secure: true,
            resource_type: "image",
            fetch_format: "auto",
            quality: "auto",
          })
        : null;
    }

    await ref.update(update);

    /* The old logo is nobody's any more. Best effort: a leftover asset
       costs a few KB, and failing the save over it would be worse. */
    if (photoPublicId !== undefined && previousPublicId && previousPublicId !== photoPublicId) {
      void cloudinary.uploader
        .destroy(previousPublicId, { resource_type: "image" })
        .catch((err: unknown) => console.error("[TownHall] Could not remove old picture:", err));
    }

    return { success: true };
  } catch (err) {
    console.error("[TownHall] Failed to update profile:", err);
    return { success: false, error: "Could not save Town Hall." };
  }
}

/** Pins or unpins one notice. */
export async function pinMessageAction(input: unknown): Promise<Result> {
  try {
    const parsed = pinMessageSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: "Invalid message." };
    const { conversationId, messageId, pinned } = parsed.data;

    const loaded = await loadManagedTownHall();
    if (!loaded.ok) return { success: false, error: loaded.error };
    const { ref } = loaded;

    /* Pins live on Town Hall alone; a pin naming another thread is a
       request this action was never meant to answer. */
    if (ref.id !== conversationId) {
      return { success: false, error: "Only Town Hall notices can be pinned." };
    }

    if (!pinned) {
      await ref.update({ pinnedMessageIds: FieldValue.arrayRemove(messageId) });
      return { success: true };
    }

    const refused = await adminDb.runTransaction(async (tx) => {
      const [conversationSnap, messageSnap] = await Promise.all([
        tx.get(ref),
        tx.get(ref.collection("messages").doc(messageId)),
      ]);
      if (!messageSnap.exists) return "That notice no longer exists.";

      const current = (conversationSnap.data()?.pinnedMessageIds as string[] | undefined) ?? [];
      if (current.includes(messageId)) return null;
      if (current.length >= MAX_PINNED_NOTICES) {
        return `Town Hall can pin ${MAX_PINNED_NOTICES} notices. Unpin one first.`;
      }

      tx.update(ref, { pinnedMessageIds: [messageId, ...current] });
      return null;
    });

    if (refused) return { success: false, error: refused };
    return { success: true };
  } catch (err) {
    console.error("[TownHall] Failed to pin message:", err);
    return { success: false, error: "Could not change that pin." };
  }
}
