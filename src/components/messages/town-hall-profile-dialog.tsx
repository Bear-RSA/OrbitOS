"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Megaphone, Trash2 } from "lucide-react";

import { updateTownHallProfileAction } from "@/app/actions/town-hall";
import { TownHallAvatar } from "@/components/messages/town-hall-avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { DIALOG_FOOTER_CLASS, DialogHeading, DialogNotice } from "@/components/ui/dialog-parts";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CHAT_IMAGE_TYPES } from "@/lib/messages/image-ceiling";
import { imageRefusal } from "@/lib/messages/image-upload";
import { cn } from "@/lib/utils/classnames";
import { MAX_TOWN_HALL_NAME_LENGTH } from "@/lib/validations/messages";
import { TOWN_HALL_NAME, type Conversation } from "@/types/message";

/* ------------------------------------------------------------------ */
/*  Edit Town Hall                                                     */
/*                                                                     */
/*  The company's name and picture. The picture uploads as soon as it  */
/*  is picked, so Save only has to name the asset; nothing changes for */
/*  anyone until Save.                                                 */
/* ------------------------------------------------------------------ */

/** undefined: unchanged. null: removed. string: the new asset's id. */
type PhotoChange = { publicId: string | null; preview: string | null } | undefined;

async function uploadTownHallPhoto(file: File): Promise<string> {
  const signResponse = await fetch("/api/messages/sign-town-hall-photo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ size: file.size, type: file.type }),
  });
  const signed = await signResponse.json().catch(() => ({}));
  if (!signResponse.ok) throw new Error(signed?.error ?? "Could not prepare that picture.");

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
  if (!upload.ok) {
    console.error("[TownHallProfile] Cloudinary refused:", await upload.json().catch(() => ({})));
    throw new Error("That picture did not upload. Try again.");
  }
  return signed.publicId as string;
}

export function TownHallProfileDialog({
  open,
  townHall,
  onClose,
}: {
  open: boolean;
  townHall: Conversation;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [photo, setPhoto] = useState<PhotoChange>(undefined);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(townHall.name ?? TOWN_HALL_NAME);
    setPhoto(undefined);
    setError(null);
  }, [open, townHall.name]);

  /* Blob URLs hold memory until released. */
  useEffect(() => {
    const preview = photo?.preview;
    if (!preview) return;
    return () => URL.revokeObjectURL(preview);
  }, [photo?.preview]);

  const pick = async (file: File) => {
    const refusal = imageRefusal(file);
    if (refusal) {
      setError(refusal);
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const publicId = await uploadTownHallPhoto(file);
      setPhoto({ publicId, preview: URL.createObjectURL(file) });
    } catch (err) {
      setError(err instanceof Error ? err.message : "That picture did not upload.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const result = await updateTownHallProfileAction({
      name,
      ...(photo !== undefined ? { photoPublicId: photo.publicId } : {}),
    });
    setSaving(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    onClose();
  };

  const shownPhoto = photo === undefined ? townHall.photoURL : photo.preview;
  const busy = saving || uploading;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeading
          icon={Megaphone}
          tone="amber"
          title="Edit Town Hall"
          description="Town Hall is the company's channel. Its name and picture show to everyone in the workspace, and on posts made as the company."
        />

        <form onSubmit={submit}>
          <div className="space-y-6">
            {error && <DialogNotice tone="red">{error}</DialogNotice>}

            <div className="flex items-center gap-4">
              <TownHallAvatar
                size="xl"
                photoURL={shownPhoto}
                name={name || TOWN_HALL_NAME}
                className={cn(uploading && "animate-pulse")}
              />
              <div className="flex flex-col items-start gap-1.5">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={busy}
                  className="flex items-center gap-2 rounded-lg bg-surface-control px-3 py-1.5 text-[12px] text-ink ring-1 ring-inset ring-line/[0.08] transition-colors hover:bg-surface-hover disabled:opacity-40"
                >
                  <Camera className="h-3.5 w-3.5" aria-hidden />
                  {uploading ? "Uploading…" : shownPhoto ? "Change picture" : "Upload picture"}
                </button>
                {shownPhoto && (
                  <button
                    type="button"
                    onClick={() => setPhoto({ publicId: null, preview: null })}
                    disabled={busy}
                    className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-[12px] text-ink-muted transition-colors hover:bg-surface-hover hover:text-orbit-red disabled:opacity-40"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    Remove
                  </button>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={Array.from(CHAT_IMAGE_TYPES).join(",")}
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void pick(file);
                  }}
                />
              </div>
            </div>

            <div className="space-y-2.5">
              <Label htmlFor="town-hall-name" className="block text-[12px] text-ink-dim">
                Name
              </Label>
              <Input
                id="town-hall-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={MAX_TOWN_HALL_NAME_LENGTH}
                placeholder="Acme Studio"
                disabled={busy}
                autoFocus
              />
            </div>
          </div>

          <DialogFooter className={cn(DIALOG_FOOTER_CLASS, "gap-2")}>
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !name.trim()} isLoading={saving}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
