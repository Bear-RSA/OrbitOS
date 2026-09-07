"use client";

import { registerVaultDocumentAction } from "@/app/actions/vault";
import type {
  VaultCategory,
  VaultClearance,
  VaultResourceType,
} from "@/types/vault";

/* ------------------------------------------------------------------ */
/*  Filing something in the Vault, from the browser                    */
/*                                                                     */
/*  Three hops, and they have to stay three. The bytes go from the     */
/*  browser straight to Cloudinary and never through this app's        */
/*  server, which is what keeps a 100MB scan off a serverless function */
/*  with a request body limit. What the server does is sign the        */
/*  upload — deciding the folder from the caller's own org, never from */
/*  anything the client asked for — and then index the result.         */
/*                                                                     */
/*  Lifted out of `vault-explorer` when meeting transcripts needed the */
/*  same path. Two copies of an upload flow means two places to get    */
/*  the signed `type` field wrong, and getting it wrong produces an    */
/*  asset that uploads cleanly and cannot be downloaded ever again.    */
/* ------------------------------------------------------------------ */

export interface DepositInput {
  file: File;
  name: string;
  note?: string;
  category: VaultCategory;
  clearance: VaultClearance;
}

/**
 * Signs, uploads and indexes one file.
 *
 * Throws rather than returning a result, because every caller is a
 * dialog that already renders a thrown message and there is nothing
 * useful to do with a half-finished upload but say so.
 */
export async function depositToVault(input: DepositInput): Promise<{ documentId: string }> {
  const { file } = input;
  if (!file) throw new Error("Choose a file first.");

  /* API routes authenticate with an ID token; server actions use the
     session cookie. This is a route, so it gets the token. */
  const auth = await import("@/lib/firebase/auth");
  const idToken = await auth.getIdToken();

  const signResponse = await fetch("/api/vault/sign-upload", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      size: file.size,
      type: file.type,
      category: input.category,
    }),
  });

  const signature = await signResponse.json();
  if (!signResponse.ok) {
    throw new Error(signature?.error || "Could not start the upload.");
  }

  const form = new FormData();
  form.append("file", file);
  form.append("api_key", signature.apiKey);
  form.append("timestamp", String(signature.timestamp));
  form.append("signature", signature.signature);
  form.append("folder", signature.folder);
  /* Must match what was signed, or Cloudinary rejects the upload — and
     must be sent at all, or the asset lands in the public namespace
     where a signed download link will not find it. */
  form.append("type", signature.type);

  const uploadResponse = await fetch(
    `https://api.cloudinary.com/v1_1/${signature.cloudName}/${signature.resource_type}/upload`,
    { method: "POST", body: form }
  );
  const uploaded = await uploadResponse.json();
  if (!uploadResponse.ok || !uploaded?.public_id) {
    throw new Error(uploaded?.error?.message || "The upload was rejected.");
  }

  /* The quota is settled here rather than at signing time — signing
     reserves nothing, so this is the point where the space is taken. */
  const result = await registerVaultDocumentAction({
    name: input.name,
    note: input.note ?? "",
    category: input.category,
    clearance: input.clearance,
    type: file.type || "application/octet-stream",
    size: file.size,
    url: uploaded.secure_url,
    publicId: uploaded.public_id,
    resourceType: (signature.resource_type as VaultResourceType) || "raw",
    format: uploaded.format || "",
  });

  if (!result.success) throw new Error(result.error);
  return { documentId: result.documentId };
}
