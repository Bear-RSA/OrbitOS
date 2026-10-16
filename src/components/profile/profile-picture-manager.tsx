"use client";

import { useState, useRef } from "react";
import { Camera, Trash2, X } from "lucide-react";
import { OrbitLoader } from "@/components/brand/orbit-loader";
import { UserAvatar } from "@/components/ui/user-avatar";
import { User } from "@/types/auth";
import { db } from "@/lib/firebase/client";
import { doc, updateDoc } from "firebase/firestore";
import { cn } from "@/lib/utils/classnames";
import { deleteProfileImage, imageFileProblem, uploadProfileImage } from "@/lib/uploads/profile-image";

interface ProfilePictureManagerProps {
  user: User;
}

export function ProfilePictureManager({ user }: ProfilePictureManagerProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const problem = imageFileProblem(file);
    if (problem) {
      alert(problem);
      return;
    }

    setIsUploading(true);
    try {
      const uploaded = await uploadProfileImage(file);

      // The old picture goes once the new one is safely up.
      if (user.photoPublicId) {
        await deleteProfileImage(user.photoPublicId).catch((err) =>
          console.error("Could not delete the old picture:", err)
        );
      }

      await updateDoc(doc(db, "users", user.id), {
        photoURL: uploaded.url,
        photoPublicId: uploaded.publicId,
      });

    } catch (error) {
      console.error("Upload error:", error);
      alert("Failed to upload profile picture.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDelete = async () => {
    if (!user.photoPublicId) return;

    setIsDeleting(true);
    try {
      await deleteProfileImage(user.photoPublicId);

      await updateDoc(doc(db, "users", user.id), {
        photoURL: null,
        photoPublicId: null,
      });

    } catch (error) {
      console.error("Delete error:", error);
      alert("Failed to delete profile picture.");
    } finally {
      setIsDeleting(false);
    }
  };

  const busy = isUploading || isDeleting;

  return (
    <div className="flex flex-col items-center gap-4 sm:items-start">
      <div className="group relative">
        <UserAvatar
          photoURL={user.photoURL}
          name={user.name}
          size="2xl"
          className={cn(
            "transition-all duration-500",
            busy ? "opacity-50 blur-sm" : "group-hover:ring-line/[0.1]"
          )}
        />

        {/* Upload Overlay — also revealed on keyboard focus, since a
            hover-only affordance is unreachable by keyboard and touch. */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={busy}
          aria-label="Change profile picture"
          className="absolute inset-2 z-20 flex flex-col items-center justify-center gap-2 rounded-[20px] bg-base/65 opacity-0 backdrop-blur-sm transition-opacity duration-300 focus-visible:opacity-100 focus-visible:outline-none group-hover:opacity-100 disabled:cursor-not-allowed"
        >
          <Camera className="h-5 w-5 text-ink" aria-hidden />
          <span className="text-[12px] text-ink">
            Change
          </span>
        </button>

        {/* Loading Spinner */}
        {busy && (
          <div className="absolute inset-0 z-30 flex items-center justify-center">
            <OrbitLoader size={44} />
          </div>
        )}

        {/* Delete Button */}
        {user.photoURL && !busy && (
          <button
            onClick={handleDelete}
            aria-label="Remove profile picture"
            title="Remove picture"
            className="absolute -right-2 -top-2 z-40 flex h-7 w-7 items-center justify-center rounded-full bg-orbit-red/[0.08] text-orbit-red shadow-lg ring-1 ring-inset ring-orbit-red/25 transition-colors hover:bg-orbit-red/[0.12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orbit-red/50"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}
      </div>

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleUpload}
        className="hidden"
        accept="image/*"
      />

      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={busy}
        className="text-[12px] text-ink-dim transition-colors hover:text-ink focus-visible:outline-none focus-visible:text-ink disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isUploading ? "Uploading…" : isDeleting ? "Removing…" : "Profile Image"}
      </button>
    </div>
  );
}
