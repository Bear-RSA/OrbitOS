import { sendImageMessageAction } from "@/app/actions/messages";
import { isChatImageType, withinImageCeiling } from "@/lib/messages/image-ceiling";

/* ------------------------------------------------------------------ */
/*  Sending a picture from the composer                                */
/*                                                                     */
/*  Three legs, in order: ask our server to sign an upload, push the   */
/*  bytes straight to Cloudinary, then tell our server what landed so  */
/*  it can write the message. The bytes never pass through a Next     */
/*  route — the same shape every other upload in the product uses —   */
/*  and the message is written by the Admin SDK because the rules will */
/*  not let a browser store a URL on our own account. See the note on  */
/*  `ImageAttachment` in `types/message`.                              */
/* ------------------------------------------------------------------ */

/** Thrown with a sentence the composer can show as-is. */
export class ImageSendError extends Error {}

/**
 * The picture on the clipboard, if there is one.
 *
 * A paste carries whatever the source put there: a screenshot tool
 * puts a PNG, a browser puts the image AND its HTML, a spreadsheet
 * puts a table and a picture of the table. The first file with an
 * accepted image type is what is meant; anything else is left for the
 * textarea to handle as text.
 */
export function pastedImage(data: DataTransfer | null): File | null {
  if (!data) return null;
  for (const item of Array.from(data.items ?? [])) {
    if (item.kind !== "file" || !isChatImageType(item.type)) continue;
    const file = item.getAsFile();
    if (file) return file;
  }
  return null;
}

/**
 * Checks a file the way the server will, so the sender is told at
 * paste time rather than after the upload.
 */
export function imageRefusal(file: File): string | null {
  if (!isChatImageType(file.type)) {
    return "Only PNG, JPEG, WebP and GIF pictures can be sent here.";
  }
  if (!withinImageCeiling(file.size)) {
    return "That picture is too large to send here.";
  }
  return null;
}

/**
 * Uploads `file` and records it as a message in `conversationId`, with
 * `text` as its caption.
 */
export async function sendImageMessage(
  conversationId: string,
  file: File,
  text: string
): Promise<void> {
  /* ── 1. A signature for this conversation ── */
  const signResponse = await fetch("/api/messages/sign-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ conversationId, size: file.size, type: file.type }),
  });
  const signed = await signResponse.json().catch(() => ({}));
  if (!signResponse.ok) {
    throw new ImageSendError(signed?.error ?? "Could not prepare that picture.");
  }

  /* ── 2. The bytes, straight to Cloudinary ── */
  /* Every signed param is echoed exactly. Adding or dropping one makes
     the signature wrong, which is how the server's choice of id and
     size limit is enforced on a client it does not trust. */
  const form = new FormData();
  form.append("file", file);
  form.append("api_key", signed.apiKey);
  form.append("timestamp", String(signed.timestamp));
  form.append("signature", signed.signature);
  form.append("public_id", signed.publicId);
  form.append("transformation", signed.transformation);

  const upload = await fetch(
    `https://api.cloudinary.com/v1_1/${signed.cloudName}/image/upload`,
    { method: "POST", body: form }
  );
  const uploaded = await upload.json().catch(() => ({}));
  if (!upload.ok) {
    console.error("[ImageUpload] Cloudinary refused:", uploaded);
    throw new ImageSendError("That picture did not upload. Try again.");
  }

  /* ── 3. The message ── */
  const result = await sendImageMessageAction({
    conversationId,
    publicId: signed.publicId,
    width: Number(uploaded.width) || 1,
    height: Number(uploaded.height) || 1,
    bytes: Number(uploaded.bytes) || file.size,
    text,
  });
  if (!result.success) throw new ImageSendError(result.error);
}
