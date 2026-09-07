"use server";

import { adminDb } from "@/lib/firebase/admin";
import { cloudinary } from "@/lib/cloudinary";
import { logActivity } from "@/lib/telemetry";
import { requireCaller } from "@/lib/auth/caller";
import { resolveVaultLimits } from "@/lib/auth/permissions";
import {
  canManageVaultDocument,
  canReadVaultDocument,
  readVaultUsage,
  applyVaultDelta,
  type VaultSubject,
} from "@/lib/vault/access";
import {
  admitVaultUpload,
  vaultDocumentAllowance,
  vaultStorageAllowance,
  DOWNLOAD_URL_TTL_SECONDS,
} from "@/lib/vault/ceiling";
import {
  resolveVaultFiling,
  VAULT_CATEGORIES,
  type VaultCategory,
  type VaultClearance,
  type VaultResourceType,
} from "@/types/vault";

/* ------------------------------------------------------------------ */
/*  Vault actions                                                      */
/*                                                                     */
/*  Every one of these resolves the caller from the session cookie.    */
/*  None of them accepts a uid in its payload — see `lib/auth/caller`  */
/*  for why a uid from the browser is a claim rather than a            */
/*  credential. On a shelf holding payroll and bank statements that    */
/*  distinction is the whole feature.                                  */
/*                                                                     */
/*  Clearance is checked here AND in Firestore rules. The rules stop   */
/*  a member's client from reading a restricted document; these        */
/*  checks stop it from being downloaded, re-filed or purged, since    */
/*  server actions run on the Admin SDK and rules do not apply to      */
/*  them at all.                                                       */
/* ------------------------------------------------------------------ */

type ActionResult<T = object> =
  | ({ success: true } & T)
  | { success: false; error: string };

function vaultCollection(orgId: string) {
  return adminDb.collection("organizations").doc(orgId).collection("vault");
}

/**
 * Narrows a stored document to the two fields clearance turns on.
 *
 * A document written before a field existed, or hand-edited in the
 * console, must not read as permissive: an absent clearance resolves to
 * RESTRICTED and an absent uploader matches nobody, so the worst a
 * malformed record can do is lock itself to owners.
 */
function subjectOf(doc: FirebaseFirestore.DocumentData): VaultSubject {
  return {
    clearance: doc.clearance === "INTERNAL" ? "INTERNAL" : "RESTRICTED",
    uploadedBy: typeof doc.uploadedBy === "string" ? doc.uploadedBy : "",
  };
}

/**
 * Thrown inside the register transaction when the workspace has no room.
 *
 * A distinct type because a transaction body can only refuse by throwing,
 * and "you are out of storage" has to reach the operator as its own
 * sentence rather than as the generic failure every other throw becomes.
 */
class VaultFullError extends Error {}

/* ------------------------------------------------------------------ */
/*  File a document                                                    */
/* ------------------------------------------------------------------ */

interface RegisterVaultDocumentPayload {
  name: string;
  note?: string;
  category: VaultCategory;
  clearance?: VaultClearance;
  type: string;
  size: number;
  url: string;
  publicId: string;
  resourceType: VaultResourceType;
  /** Cloudinary's own format string, needed to build download links. */
  format?: string;
}

/**
 * Indexes an asset that has already landed in Cloudinary.
 *
 * The quota is settled here rather than at signing time, and inside a
 * transaction, because signing reserves nothing: two uploads begun at
 * once are both signed against the same free space. This is the point
 * where the space is actually taken, so it is the only place the
 * arithmetic can be trusted.
 */
export async function registerVaultDocumentAction(
  payload: RegisterVaultDocumentPayload
): Promise<ActionResult<{ documentId: string }>> {
  try {
    const caller = await requireCaller();
    if (!caller.ok) return { success: false, error: caller.error };
    const { uid, orgId, name: callerName } = caller;

    const name = (payload.name || "").trim();
    if (!name || !payload.url || !payload.publicId) {
      return { success: false, error: "Incomplete document metadata." };
    }

    const size = Number(payload.size);
    const { category, clearance } = resolveVaultFiling(
      payload.category,
      payload.clearance
    );

    const resourceType: VaultResourceType = ["image", "video", "raw"].includes(
      payload.resourceType
    )
      ? payload.resourceType
      : "raw";

    const tier = await resolveVaultLimits(orgId);
    const maxBytes = vaultStorageAllowance(tier.maxStorageMb);
    const maxDocuments = vaultDocumentAllowance(tier.maxDocuments);

    const orgRef = adminDb.collection("organizations").doc(orgId);
    const documentRef = vaultCollection(orgId).doc();

    await adminDb.runTransaction(async (tx) => {
      const orgSnap = await tx.get(orgRef);
      const usage = readVaultUsage(orgSnap.data());

      const admission = admitVaultUpload({
        size,
        usedBytes: usage.bytes,
        usedDocuments: usage.documents,
        maxBytes,
        maxDocuments,
      });

      if (!admission.allowed) {
        throw new VaultFullError(admission.error || "Vault is full.");
      }

      tx.set(documentRef, {
        orgId,
        name,
        note: (payload.note || "").trim().slice(0, 500),
        category,
        clearance,
        url: payload.url,
        publicId: payload.publicId,
        resourceType,
        format: payload.format || "",
        size: Number.isFinite(size) && size > 0 ? Math.floor(size) : 0,
        type: payload.type || "application/octet-stream",
        uploadedBy: uid,
        uploadedByName: callerName,
        createdAt: new Date(),
      });

      tx.set(
        orgRef,
        { vaultUsage: applyVaultDelta(usage, size, 1) },
        { merge: true }
      );
    });

    await logActivity({
      eventType: "VAULT_DOCUMENT_FILED",
      orgId,
      actor: { uid, name: callerName },
      metadata: {
        fileName: name,
        documentId: documentRef.id,
        category: VAULT_CATEGORIES[category].label,
        clearance,
      },
    });

    return { success: true, documentId: documentRef.id };
  } catch (err) {
    if (err instanceof VaultFullError) {
      return { success: false, error: err.message };
    }
    console.error("[Vault] Failed to file document:", err);
    return { success: false, error: "Could not file this document." };
  }
}

/* ------------------------------------------------------------------ */
/*  Download                                                           */
/* ------------------------------------------------------------------ */

/**
 * Mints a short-lived, signed download link for one document.
 *
 * Vault assets are stored as Cloudinary `authenticated`, so the stored
 * `url` on the document is not by itself fetchable — this signature is
 * the only way to read the bytes, and it is issued only after the
 * caller's clearance has been checked against the document.
 */
export async function getVaultDownloadUrlAction(payload: {
  documentId: string;
}): Promise<ActionResult<{ url: string }>> {
  try {
    const caller = await requireCaller();
    if (!caller.ok) return { success: false, error: caller.error };
    const { uid, orgId, role } = caller;

    const snap = await vaultCollection(orgId).doc(payload.documentId).get();
    if (!snap.exists) {
      return { success: false, error: "Document not found." };
    }

    const doc = snap.data()!;
    if (!canReadVaultDocument(subjectOf(doc), { uid, role })) {
      /* Deliberately the same sentence a missing document gets. Telling a
         member that a restricted document exists and they may not read it
         leaks the one thing the clearance is there to hide — that payroll
         for a named month was filed at all. */
      return { success: false, error: "Document not found." };
    }

    const url = cloudinary.utils.private_download_url(
      doc.publicId as string,
      (doc.format as string) || "",
      {
        resource_type: (doc.resourceType as VaultResourceType) || "raw",
        type: "authenticated",
        attachment: true,
        expires_at: Math.round(Date.now() / 1000) + DOWNLOAD_URL_TTL_SECONDS,
      }
    );

    return { success: true, url };
  } catch (err) {
    console.error("[Vault] Failed to mint download link:", err);
    return { success: false, error: "Could not open this document." };
  }
}

/* ------------------------------------------------------------------ */
/*  Re-file                                                            */
/* ------------------------------------------------------------------ */

/**
 * Changes a document's shelf, its clearance, its label or its note.
 *
 * The asset itself never moves. Cloudinary's folder is set at upload and
 * re-classifying is a Firestore edit, so a document that changes category
 * keeps a public_id naming the shelf it arrived on — cosmetic, and worth
 * it against a rename API call that can half-fail and orphan the bytes.
 */
export async function updateVaultDocumentAction(payload: {
  documentId: string;
  name?: string;
  note?: string;
  category?: VaultCategory;
  clearance?: VaultClearance;
}): Promise<ActionResult> {
  try {
    const caller = await requireCaller();
    if (!caller.ok) return { success: false, error: caller.error };
    const { uid, orgId, role, name: callerName } = caller;

    const ref = vaultCollection(orgId).doc(payload.documentId);
    const snap = await ref.get();
    if (!snap.exists) return { success: false, error: "Document not found." };

    const doc = snap.data()!;
    if (!canManageVaultDocument(subjectOf(doc), { uid, role })) {
      return {
        success: false,
        error: "Only an owner or the person who filed this can change it.",
      };
    }

    const { category, clearance } = resolveVaultFiling(
      payload.category ?? doc.category,
      payload.clearance ?? doc.clearance
    );

    const patch: Record<string, unknown> = {
      category,
      clearance,
      updatedAt: new Date(),
    };

    const name = payload.name?.trim();
    if (name) patch.name = name;
    if (payload.note !== undefined) patch.note = payload.note.trim().slice(0, 500);

    await ref.update(patch);

    /* Only a clearance change is logged. A rename or a note is
       housekeeping, but "who made the payroll register readable by the
       whole workspace, and when" is the question an audit actually
       asks. */
    if (clearance !== doc.clearance) {
      await logActivity({
        eventType: "VAULT_CLEARANCE_CHANGED",
        orgId,
        actor: { uid, name: callerName },
        metadata: {
          fileName: (patch.name as string) || (doc.name as string),
          documentId: payload.documentId,
          from: doc.clearance,
          to: clearance,
        },
      });
    }

    return { success: true };
  } catch (err) {
    console.error("[Vault] Failed to update document:", err);
    return { success: false, error: "Could not update this document." };
  }
}

/* ------------------------------------------------------------------ */
/*  Purge                                                              */
/* ------------------------------------------------------------------ */

export async function deleteVaultDocumentAction(payload: {
  documentId: string;
}): Promise<ActionResult> {
  try {
    const caller = await requireCaller();
    if (!caller.ok) return { success: false, error: caller.error };
    const { uid, orgId, role, name: callerName } = caller;

    const orgRef = adminDb.collection("organizations").doc(orgId);
    const ref = vaultCollection(orgId).doc(payload.documentId);

    const snap = await ref.get();
    if (!snap.exists) return { success: false, error: "Document not found." };

    const doc = snap.data()!;
    if (!canManageVaultDocument(subjectOf(doc), { uid, role })) {
      return {
        success: false,
        error: "Only an owner or the person who filed this can purge it.",
      };
    }

    /* Firestore first, Cloudinary second.
       If the index write fails the bytes are still there and the row
       still points at them, which is a retry. The other order leaves a
       row in the shelf whose asset is gone — a document that appears to
       be filed and cannot be opened, which is worse than paying for
       bytes nobody references. */
    await adminDb.runTransaction(async (tx) => {
      const orgSnap = await tx.get(orgRef);
      const usage = readVaultUsage(orgSnap.data());
      tx.delete(ref);
      tx.set(
        orgRef,
        { vaultUsage: applyVaultDelta(usage, Number(doc.size), -1) },
        { merge: true }
      );
    });

    try {
      await cloudinary.uploader.destroy(doc.publicId as string, {
        resource_type: (doc.resourceType as VaultResourceType) || "raw",
        type: "authenticated",
      });
    } catch (cloudErr) {
      /* Loud, because this is the leak: the usage counter has already
         been credited back, so the workspace can refill space that is
         still being billed. */
      console.error("[Vault] Orphaned Cloudinary asset:", doc.publicId, cloudErr);
    }

    await logActivity({
      eventType: "VAULT_DOCUMENT_PURGED",
      orgId,
      actor: { uid, name: callerName },
      metadata: {
        fileName: doc.name as string,
        documentId: payload.documentId,
        category: VAULT_CATEGORIES[doc.category as VaultCategory]?.label,
      },
    });

    return { success: true };
  } catch (err) {
    console.error("[Vault] Failed to purge document:", err);
    return { success: false, error: "Could not purge this document." };
  }
}
