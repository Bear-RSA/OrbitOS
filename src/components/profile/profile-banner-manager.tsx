"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { doc, updateDoc } from "firebase/firestore";
import { OrbitLoader } from "@/components/brand/orbit-loader";
import { getOrgChartAction } from "@/app/actions/org-chart";
import { tintStyle } from "@/components/ui/department-glass";
import { tintsByPerson } from "@/lib/members/chart-layout";
import type { DepartmentTint } from "@/lib/members/department-tint";
import { db } from "@/lib/firebase/client";
import {
  bannerDeliveryUrl,
  deleteProfileImage,
  imageFileProblem,
  uploadProfileImage,
} from "@/lib/uploads/profile-image";
import { cn } from "@/lib/utils/classnames";
import { ImageCropDialog } from "@/components/profile/image-crop-dialog";
import type { User } from "@/types/auth";

/* ------------------------------------------------------------------ */
/*  Profile banner                                                     */
/*                                                                     */
/*  The wide image across the top of your profile card. Without one,  */
/*  the card shows your department's colour, so the preview here      */
/*  shows that too: what you see is what everyone else sees.          */
/* ------------------------------------------------------------------ */

export function ProfileBannerManager({ user }: { user: User }) {
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [cropping, setCropping] = useState<File | null>(null);
  const [shade, setShade] = useState<DepartmentTint | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    getOrgChartAction()
      .then((result) => {
        if (!cancelled && result.success) setShade(tintsByPerson(result.chart).get(user.id) ?? null);
      })
      .catch((err) => console.error("[ProfileBanner] Org chart unavailable:", err));
    return () => {
      cancelled = true;
    };
  }, [user.id]);

  // Picking a file opens the cropper; the upload starts from its Save.
  const handlePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!file) return;

    const problem = imageFileProblem(file);
    if (problem) {
      alert(problem);
      return;
    }
    setCropping(file);
  };

  const handleUpload = async (file: File) => {
    setCropping(null);
    setIsUploading(true);
    try {
      const uploaded = await uploadProfileImage(file);

      // The old banner goes once the new one is safely up.
      if (user.bannerPublicId) {
        await deleteProfileImage(user.bannerPublicId).catch((err) =>
          console.error("Could not delete the old banner:", err)
        );
      }

      await updateDoc(doc(db, "users", user.id), {
        bannerURL: bannerDeliveryUrl(uploaded.url),
        bannerPublicId: uploaded.publicId,
      });
    } catch (error) {
      console.error("Banner upload error:", error);
      alert("Failed to upload banner.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async () => {
    if (!user.bannerPublicId) return;

    setIsDeleting(true);
    try {
      await deleteProfileImage(user.bannerPublicId);
      await updateDoc(doc(db, "users", user.id), {
        bannerURL: null,
        bannerPublicId: null,
      });
    } catch (error) {
      console.error("Banner delete error:", error);
      alert("Failed to remove banner.");
    } finally {
      setIsDeleting(false);
    }
  };

  const busy = isUploading || isDeleting;

  /* A strip across the top edge of the card it sits in, the way it sits
     on the profile card. The card's rounded corners clip it. */
  return (
    <div
      style={shade ? tintStyle(shade) : undefined}
      className={cn(
        "relative h-28 w-full overflow-hidden border-b sm:h-36",
        user.bannerURL
          ? "border-line/[0.07]"
          : shade
            ? "border-[rgb(var(--tint)/0.18)] bg-[linear-gradient(180deg,rgb(var(--tint)/0.16)_0%,rgb(var(--tint)/0.06)_100%)]"
            : "border-line/[0.07] bg-surface-hover/60"
      )}
    >
      {user.bannerURL && (
        // eslint-disable-next-line @next/next/no-img-element -- already sized and compressed by Cloudinary
        <img
          src={user.bannerURL}
          alt=""
          className={cn("h-full w-full object-cover transition-opacity duration-300", busy && "opacity-50")}
        />
      )}

      {busy && (
        <div className="absolute inset-0 flex items-center justify-center">
          <OrbitLoader size={32} />
        </div>
      )}

      <div className="absolute right-3 top-3 flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={busy}
          title={user.bannerURL ? undefined : "Without one, your card shows your department's colour"}
          className="flex h-8 items-center gap-1.5 rounded-full bg-base/60 px-3 text-[12px] text-ink ring-1 ring-inset ring-line/[0.1] backdrop-blur-md transition-colors hover:bg-base/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ImagePlus className="h-3.5 w-3.5" aria-hidden />
          {isUploading ? "Uploading…" : user.bannerURL ? "Change banner" : "Add banner"}
        </button>

        {user.bannerURL && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={busy}
            aria-label="Remove banner"
            title="Remove banner"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-base/60 text-orbit-red ring-1 ring-inset ring-orbit-red/25 backdrop-blur-md transition-colors hover:bg-orbit-red/[0.15] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orbit-red/50 disabled:opacity-50"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}
      </div>

      <input
        type="file"
        ref={fileInputRef}
        onChange={handlePick}
        className="hidden"
        accept="image/*"
      />

      <ImageCropDialog
        file={cropping}
        aspect={3}
        outputWidth={1500}
        title="Profile banner"
        frameClassName="rounded-2xl"
        onCancel={() => setCropping(null)}
        onConfirm={handleUpload}
      />
    </div>
  );
}
