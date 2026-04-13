"use client";

import { useState, useEffect, useRef } from "react";
import { FileText, Download, Loader2, Plus, HardDrive, Trash2 } from "lucide-react";
import { deleteProjectFileAction } from "@/app/actions/files";
import { ProjectFile } from "@/types/file";
import { Member } from "@/types/member";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { subscribeToProjectFiles } from "@/lib/queries/files";
import { cn } from "@/lib/utils/classnames";
import { format } from "date-fns";
import { UserAvatar } from "@/components/ui/user-avatar";

interface ProjectFilesProps {
  projectId: string;
  members: Member[];
  isOwner: boolean;
  uid: string;
}

export function ProjectFiles({ projectId, members, isOwner, uid }: ProjectFilesProps) {
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [fileToDelete, setFileToDelete] = useState<ProjectFile | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLoading(true);
    const unsub = subscribeToProjectFiles(projectId, (data) => {
      setFiles(data);
      setLoading(false);
    });
    return () => unsub();
  }, [projectId]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const auth = await import("@/lib/firebase/auth");
      const idToken = await auth.getIdToken();

      // 1. Get signed upload parameters
      const sigResponse = await fetch("/api/cloudinary/sign-upload", {
        method: "POST",
        headers: { 
          "Authorization": `Bearer ${idToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ projectId }),
      });

      if (!sigResponse.ok) throw new Error("Failed to get sign-upload payload");
      const { timestamp, signature, apiKey, cloudName, folder } = await sigResponse.json();

      // 2. Upload to Cloudinary
      const formData = new FormData();
      formData.append("file", file);
      formData.append("api_key", apiKey);
      formData.append("timestamp", timestamp.toString());
      formData.append("signature", signature);
      formData.append("folder", folder);

      const uploadResponse = await fetch(
        `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`, // Using auto to handle non-images
        {
          method: "POST",
          body: formData,
        }
      );

      if (!uploadResponse.ok) {
        const err = await uploadResponse.json();
        throw new Error(err.error?.message || "Upload failed");
      }

      // 3. Register metadata (Optionally, we can let webhook do this, 
      // but registering here gives immediate feedback if we don't want to wait for webhook)
      // Actually, user wants the webhook to be the source of truth, 
      // and we have a listener (onSnapshot) so it will appear automatically.
      
    } catch (err) {
      console.error("Upload error:", err);
      alert("Failed to upload file.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const getMemberName = (userId: string) => {
    return members.find(m => m.id === userId)?.name || "System";
  };

  const getMemberPhoto = (userId: string) => {
    return members.find(m => m.id === userId)?.photoURL;
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const handleDelete = async (e: React.MouseEvent, file: ProjectFile) => {
    e.stopPropagation();
    setFileToDelete(file);
  };

  const executeDelete = async () => {
    if (!fileToDelete) return;

    setDeletingId(fileToDelete.id);
    try {
      const result = await deleteProjectFileAction({
        projectId,
        fileId: fileToDelete.id,
        publicId: fileToDelete.publicId,
        resourceType: fileToDelete.type.split("/")[0] || "image",
        uid,
      });
      
      if (!result.success) {
        alert(result.error || "Failed to delete file.");
      }
    } catch (err) {
      console.error("Critical delete error:", err);
      alert("Failed to delete file due to a system error.");
    } finally {
      setDeletingId(null);
      setFileToDelete(null);
    }
  };

  return (
    <div className="space-y-12 animate-fade-in" style={{ animationDelay: '200ms', animationFillMode: 'both' }}>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-8 mb-4">
        <div>
          <h2 className="text-[10px] font-mono uppercase tracking-[0.3em] text-[#444444] mb-3">
            Asset Repository
          </h2>
          <div className="flex items-center gap-4">
            <h3 className="text-2xl font-light text-[#ededed] tracking-tight">Project File Explorer</h3>
            <span className="h-4 w-px bg-white/[0.06]" />
            <span className="text-[12px] text-[#555555] font-mono tabular-nums">
              {loading ? "Scanning..." : `${files.length} Indices Found`}
            </span>
          </div>
        </div>

        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="flex items-center gap-2.5 px-5 h-10 rounded-lg bg-[#111111] hover:bg-[#161616] text-[#ededed] text-[12px] font-medium transition-all duration-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] border border-white/[0.02] disabled:opacity-50 group shrink-0"
        >
          {isUploading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-[#666666]" />
          ) : (
            <Plus className="w-3.5 h-3.5 text-[#666666] group-hover:text-[#aaa] transition-colors" />
          )}
          Import Asset
        </button>
      </div>

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleUpload}
        className="hidden"
      />

      <div className="overflow-x-auto -mx-4 px-4">
        <table className="w-full text-left border-collapse min-w-[900px]">
          <thead>
            <tr className="border-b border-white/[0.05]">
              <th className="pb-5 pt-2 text-[10px] font-mono uppercase tracking-[0.2em] text-[#3a3a3a] w-[40%]">
                File Identifier
              </th>
              <th className="pb-5 pt-2 text-[10px] font-mono uppercase tracking-[0.2em] text-[#3a3a3a] w-[15%]">
                Metadata
              </th>
              <th className="pb-5 pt-2 text-[10px] font-mono uppercase tracking-[0.2em] text-[#3a3a3a] w-[20%]">
                Uploader
              </th>
              <th className="pb-5 pt-2 text-[10px] font-mono uppercase tracking-[0.2em] text-[#3a3a3a] w-[15%]">
                Timestamp
              </th>
              <th className="pb-5 pt-2 text-[10px] font-mono uppercase tracking-[0.2em] text-[#3a3a3a] w-[10%] text-right">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              // Skeleton Loader
              Array.from({ length: 3 }).map((_, i) => (
                <tr key={i} className="border-b border-white/[0.02] animate-pulse">
                  <td className="py-6 pr-6">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-white/[0.03]" />
                      <div className="space-y-2">
                        <div className="h-4 w-48 bg-white/[0.03] rounded" />
                        <div className="h-3 w-24 bg-white/[0.02] rounded" />
                      </div>
                    </div>
                  </td>
                  <td className="py-6 pr-4 align-top">
                    <div className="h-4 w-16 bg-white/[0.03] rounded mt-1" />
                  </td>
                  <td className="py-6 pr-4 align-top">
                    <div className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded-full bg-white/[0.03]" />
                      <div className="h-4 w-20 bg-white/[0.03] rounded" />
                    </div>
                  </td>
                  <td className="py-6 pr-4 align-top">
                    <div className="h-4 w-24 bg-white/[0.03] rounded mt-1" />
                  </td>
                  <td className="py-6 text-right align-top">
                    <div className="h-4 w-4 bg-white/[0.03] rounded ml-auto" />
                  </td>
                </tr>
              ))
            ) : files.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-24 text-center">
                   <div className="flex flex-col items-center justify-center">
                    <div className="w-12 h-12 bg-[#0A0A0A] rounded-2xl flex items-center justify-center ring-1 ring-white/5 mb-6">
                      <HardDrive className="w-5 h-5 text-[#222222]" />
                    </div>
                    <p className="text-[14px] font-medium text-[#ededed] mb-1">No files uploaded yet.</p>
                    <p className="text-[13px] text-[#444444] font-light max-w-sm mx-auto">
                      Assets indexed in this project thread will appear here as searchable nodes.
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              files.map((file, index) => (
                <tr
                  key={file.id}
                  className="row-enter group/row transition-all duration-300 hover:bg-white/[0.02] border-b border-white/[0.02] last:border-b-0"
                  style={{ animationDelay: `${index * 60}ms` }}
                >
                  <td className="py-6 pr-6">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-[#0A0A0A] border border-white/[0.04] flex items-center justify-center group-hover/row:scale-105 transition-transform duration-500">
                        <FileText className="w-5 h-5 text-[#444444] group-hover/row:text-[#888888] transition-colors" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[14px] font-medium text-[#ededed] truncate group-hover/row:text-white transition-colors duration-300">
                          {file.name}
                        </p>
                        <p className="text-[11px] font-mono text-[#444444] uppercase tracking-wider mt-1 group-hover/row:text-[#555] transition-colors">
                          {formatSize(file.size)}
                        </p>
                      </div>
                    </div>
                  </td>
                  
                  <td className="py-6 pr-4 align-top">
                    <span className="inline-flex items-center px-2 py-0.5 rounded bg-white/[0.03] text-[9px] font-mono text-[#888888] uppercase tracking-wider ring-1 ring-white/[0.05] mt-1 group-hover/row:bg-white/[0.06] transition-colors">
                       {file.type.includes('/') ? file.type.split("/")[1] : file.type || "DOC"}
                    </span>
                  </td>

                  <td className="py-6 pr-4 align-top">
                    <div className="flex items-center gap-2.5 mt-1">
                      <UserAvatar 
                        name={getMemberName(file.uploadedBy)} 
                        photoURL={getMemberPhoto(file.uploadedBy)} 
                        size="sm" 
                      />
                      <span className="text-[13px] text-[#888888] group-hover/row:text-[#bbb] transition-colors">
                        {getMemberName(file.uploadedBy)}
                      </span>
                    </div>
                  </td>

                  <td className="py-6 pr-4 align-top">
                    <div className="flex flex-col gap-0.5 mt-1">
                      <span className="text-[12px] text-[#666666] group-hover/row:text-[#888888] transition-colors">
                        {format(file.createdAt?.toDate() || new Date(), "dd MMM yyyy")}
                      </span>
                      <span className="text-[9px] font-mono text-[#333333] uppercase">
                        {format(file.createdAt?.toDate() || new Date(), "HH:mm")}
                      </span>
                    </div>
                  </td>

                  <td className="py-6 text-right align-top">
                    <div className="flex items-center justify-end gap-1">
                      <a
                        href={file.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center p-2 rounded-lg text-[#333333] hover:text-[#ededed] hover:bg-white/[0.05] transition-all duration-300"
                        title="Download Asset"
                      >
                        <Download className="w-4 h-4" />
                      </a>
                      {isOwner && (
                        <button
                          onClick={(e) => handleDelete(e, file)}
                          disabled={deletingId === file.id}
                          className={cn(
                            "inline-flex items-center justify-center p-2 rounded-lg transition-all duration-300",
                            deletingId === file.id
                              ? "text-[#555555] cursor-not-allowed"
                              : "text-[#333333] hover:text-orbit-red hover:bg-orbit-red/[0.08]"
                          )}
                          title="Delete Asset"
                        >
                          {deletingId === file.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={!!fileToDelete}
        onOpenChange={(open) => !open && setFileToDelete(null)}
        title="Execute Deletion Protocol"
        description={`Are you sure you want to remove "${fileToDelete?.name}"? Both the index record and the physical cloud storage asset will be permanently destroyed.`}
        onConfirm={executeDelete}
        confirmText="Confirm Deletion"
        variant="destructive"
        loading={!!deletingId}
      />
    </div>
  );
}
