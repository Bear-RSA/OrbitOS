"use client";

import { useState, useRef } from "react";
import { Camera, Loader2, Trash2, X } from "lucide-react";
import { UserAvatar } from "@/components/ui/user-avatar";
import { User } from "@/types/auth";
import { db } from "@/lib/firebase/client";
import { doc, updateDoc } from "firebase/firestore";
import { cn } from "@/lib/utils/classnames";

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

    // 1. Basic validation
    if (!file.type.startsWith("image/")) {
      alert("Please upload an image file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert("Image size should be less than 5MB.");
      return;
    }

    setIsUploading(true);
    try {
      // 2. Get signed upload parameters from our API
      const auth = await import("@/lib/firebase/auth");
      const idToken = await auth.getIdToken();
      
      const sigResponse = await fetch("/api/upload/signature", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${idToken}`,
        },
      });

      if (!sigResponse.ok) throw new Error("Failed to get upload signature");
      
      const { timestamp, signature, apiKey, cloudName, folder } = await sigResponse.json();

      // 3. Upload directly to Cloudinary
      const formData = new FormData();
      formData.append("file", file);
      formData.append("api_key", apiKey);
      formData.append("timestamp", timestamp.toString());
      formData.append("signature", signature);
      formData.append("folder", folder);

      const uploadResponse = await fetch(
        `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
        {
          method: "POST",
          body: formData,
        }
      );

      if (!uploadResponse.ok) {
        const errorBody = await uploadResponse.json();
        console.error("Cloudinary error details:", errorBody);
        throw new Error(`Cloudinary upload failed: ${errorBody.error?.message || "Unknown error"}`);
      }
      
      const uploadData = await uploadResponse.json();

      // 4. Delete previous image if it exists
      if (user.photoPublicId) {
        await fetch("/api/upload/delete", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${idToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ publicId: user.photoPublicId }),
        });
      }

      // 5. Update Firestore
      await updateDoc(doc(db, "users", user.id), {
        photoURL: uploadData.secure_url,
        photoPublicId: uploadData.public_id,
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
      const auth = await import("@/lib/firebase/auth");
      const idToken = await auth.getIdToken();

      const response = await fetch("/api/upload/delete", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ publicId: user.photoPublicId }),
      });

      if (!response.ok) throw new Error("Failed to delete image");

      // Update Firestore
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

  return (
    <div className="flex flex-col items-center sm:items-start gap-6">
      <div className="relative group">
        <UserAvatar
          photoURL={user.photoURL}
          name={user.name}
          size="2xl"
          className={cn(
            "transition-all duration-500",
            isUploading || isDeleting ? "opacity-50 blur-sm" : ""
          )}
        />
        
        {/* Upload Overlay */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading || isDeleting}
          className="absolute inset-2 z-20 rounded-[20px] bg-[#050505]/60 opacity-0 group-hover:opacity-100 backdrop-blur-sm flex flex-col items-center justify-center gap-2 transition-all duration-300 disabled:cursor-not-allowed"
        >
          <Camera className="w-6 h-6 text-[#ededed]" />
          <span className="text-[10px] font-mono uppercase tracking-widest text-[#ededed]">Change</span>
        </button>

        {/* Loading Spinner */}
        {(isUploading || isDeleting) && (
          <div className="absolute inset-0 z-30 flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-[#ededed] animate-spin" />
          </div>
        )}

        {/* Delete Button */}
        {user.photoURL && !isUploading && !isDeleting && (
          <button
            onClick={handleDelete}
            className="absolute -top-2 -right-2 z-40 w-8 h-8 rounded-full bg-[#1A0A0A] border border-[#E57A7A]/20 flex items-center justify-center text-[#E57A7A] hover:bg-[#2A0A0A] transition-colors shadow-lg"
            title="Remove picture"
          >
            <X className="w-4 h-4" />
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

      <div className="flex flex-col gap-1 text-center sm:text-left">
        <p className="text-[12px] text-[#ededed] font-medium">Profile Image</p>

      </div>
    </div>
  );
}
