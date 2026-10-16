/* ------------------------------------------------------------------ */
/*  Profile images: the picture and the banner                         */
/*                                                                     */
/*  Both go straight to Cloudinary with a signature from               */
/*  `/api/upload/signature`, into the person's own folder. The delete  */
/*  route only removes files from that folder, so neither can touch    */
/*  anyone else's.                                                     */
/* ------------------------------------------------------------------ */

const MAX_BYTES = 5 * 1024 * 1024;

/** Why a file can't be used, or null when it can. */
export function imageFileProblem(file: File): string | null {
  if (!file.type.startsWith("image/")) return "Please upload an image file.";
  if (file.size > MAX_BYTES) return "Image size should be less than 5MB.";
  return null;
}

async function idToken(): Promise<string> {
  const auth = await import("@/lib/firebase/auth");
  const token = await auth.getIdToken();
  if (!token) throw new Error("Not signed in");
  return token;
}

/** Uploads one image and returns where it lives. */
export async function uploadProfileImage(file: File): Promise<{ url: string; publicId: string }> {
  const token = await idToken();
  const sigResponse = await fetch("/api/upload/signature", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!sigResponse.ok) throw new Error("Failed to get upload signature");

  const { timestamp, signature, apiKey, cloudName, folder } = await sigResponse.json();

  const formData = new FormData();
  formData.append("file", file);
  formData.append("api_key", apiKey);
  formData.append("timestamp", timestamp.toString());
  formData.append("signature", signature);
  formData.append("folder", folder);

  const uploadResponse = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: "POST",
    body: formData,
  });
  if (!uploadResponse.ok) {
    const errorBody = await uploadResponse.json();
    console.error("Cloudinary error details:", errorBody);
    throw new Error(`Cloudinary upload failed: ${errorBody.error?.message || "Unknown error"}`);
  }

  const uploadData = await uploadResponse.json();
  return { url: uploadData.secure_url, publicId: uploadData.public_id };
}

/** Deletes one of the caller's own images. */
export async function deleteProfileImage(publicId: string): Promise<void> {
  const token = await idToken();
  const response = await fetch("/api/upload/delete", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ publicId }),
  });
  if (!response.ok) throw new Error("Failed to delete image");
}

/**
 * A banner served cropped to 3:1 and compressed, so a phone photo of a
 * few megabytes is never what every profile card downloads.
 */
export function bannerDeliveryUrl(secureUrl: string): string {
  return secureUrl.replace("/image/upload/", "/image/upload/c_fill,g_auto,w_1200,h_400,q_auto,f_auto/");
}
