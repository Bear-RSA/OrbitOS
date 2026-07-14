"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import {
  FileText,
  Download,
  Loader2,
  Plus,
  HardDrive,
  Trash2,
  LayoutGrid,
  LayoutList,
  Image as ImageIcon,
  Film,
  FileArchive,
  FileCode,
  FileSpreadsheet,
  File,
} from "lucide-react";
import { deleteProjectFileAction, getSignedDownloadUrlAction } from "@/app/actions/files";
import { ProjectFile } from "@/types/file";
import { Member } from "@/types/member";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { subscribeToProjectFiles } from "@/lib/queries/files";
import { cn } from "@/lib/utils/classnames";
import { format } from "date-fns";
import { UserAvatar } from "@/components/ui/user-avatar";
import { SuccessModal } from "@/components/ui/success-modal";
import { DeleteFileDialog } from "./delete-file-dialog";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

type ViewMode = "list" | "grid";

/** Maps a MIME type or extension to a visual category */
function getFileCategory(type: string): {
  label: string;
  icon: typeof FileText;
  accent: string;
} {
  const t = type.toLowerCase();
  if (t.includes("image") || /\.(png|jpg|jpeg|gif|svg|webp)$/i.test(t))
    return { label: "IMG", icon: ImageIcon, accent: "#ededed" };
  if (t.includes("video") || /\.(mp4|mov|webm|avi)$/i.test(t))
    return { label: "VID", icon: Film, accent: "#78B8FF" };
  if (t.includes("pdf"))
    return { label: "PDF", icon: FileText, accent: "#FF8878" };
  if (t.includes("zip") || t.includes("rar") || t.includes("tar") || t.includes("gz") || t.includes("7z"))
    return { label: "ARC", icon: FileArchive, accent: "#FFD278" };
  if (t.includes("spreadsheet") || t.includes("csv") || t.includes("xlsx") || t.includes("xls"))
    return { label: "XLS", icon: FileSpreadsheet, accent: "#85C89B" };
  if (t.includes("json") || t.includes("javascript") || t.includes("typescript") || t.includes("html") || t.includes("css"))
    return { label: "CODE", icon: FileCode, accent: "#78FFD2" };
  // Fallback: extract extension from type
  const ext = t.includes("/") ? t.split("/")[1]?.toUpperCase()?.slice(0, 4) : t.toUpperCase().slice(0, 4);
  return { label: ext || "DOC", icon: File, accent: "#888888" };
}

function formatSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface SystemExplorerProps {
  projectId: string;
  members: Member[];
  isOwner: boolean;
  uid: string;
}

export function SystemExplorer({ projectId, members, isOwner, uid }: SystemExplorerProps) {
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [fileToDelete, setFileToDelete] = useState<ProjectFile | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  /* ── Firestore realtime subscription ── */
  useEffect(() => {
    setLoading(true);
    const unsub = subscribeToProjectFiles(projectId, (data) => {
      setFiles(data);
      setLoading(false);
    });
    return () => unsub();
  }, [projectId]);

  /* ── Derived telemetry ── */
  const totalStorage = useMemo(
    () => files.reduce((sum, f) => sum + (f.size || 0), 0),
    [files]
  );

  /* ── Upload handler (unchanged backend) ── */
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const auth = await import("@/lib/firebase/auth");
      const idToken = await auth.getIdToken();

      const sigResponse = await fetch("/api/cloudinary/sign-upload", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ projectId, name: file.name, type: file.type }),
      });

      if (!sigResponse.ok) throw new Error("Failed to get sign-upload payload");
      const { timestamp, signature, apiKey, cloudName, folder, resource_type = "auto" } = await sigResponse.json();

      const formData = new FormData();
      formData.append("file", file);
      formData.append("api_key", apiKey);
      formData.append("timestamp", timestamp.toString());
      formData.append("signature", signature);
      formData.append("folder", folder);

      const uploadResponse = await fetch(
        `https://api.cloudinary.com/v1_1/${cloudName}/${resource_type}/upload`,
        { method: "POST", body: formData }
      );

      const uploadData = await uploadResponse.json();
      
      // 3. Register the asset in Firestore
      const { registerProjectFileAction } = await import("@/app/actions/files");
      const regResult = await registerProjectFileAction({
        projectId,
        name: file.name,
        type: file.type,
        size: file.size,
        url: uploadData.secure_url,
        publicId: uploadData.public_id,
        uid,
      });

      if (!regResult.success) {
        throw new Error(regResult.error || "Failed to register asset index.");
      }
      
      setShowSuccess(true);
    } catch (err: any) {
      console.error("Upload error:", err);
      alert(err.message || "Failed to upload file.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  /* ── Member resolution ── */
  const getMemberName = (userId: string) =>
    members.find((m) => m.id === userId)?.name || "System";
  const getMemberPhoto = (userId: string) =>
    members.find((m) => m.id === userId)?.photoURL;

  /* ── Download handler ── */
  const handleDownload = async (e: React.MouseEvent, file: ProjectFile) => {
    e.stopPropagation();
    if (downloadingId) return;

    setDownloadingId(file.id);
    try {
      const mimeType = file.type.split("/")[0];
      const resourceType = (mimeType === "image" || mimeType === "video") ? mimeType : "raw";

      const result = await getSignedDownloadUrlAction({
        projectId,
        publicId: file.publicId,
        resourceType,
        uid,
      });

      if (!result.success || !result.url) {
        console.error("[Download] Failed:", result.error);
        return;
      }

      window.open(result.url, "_blank");
    } catch (err) {
      console.error("[Download] Error:", err);
    } finally {
      setDownloadingId(null);
    }
  };

  /* ── Delete handlers ── */
  const handleDelete = (e: React.MouseEvent, file: ProjectFile) => {
    e.stopPropagation();
    setFileToDelete(file);
  };

  const executeDelete = async () => {
    if (!fileToDelete) return;
    setDeletingId(fileToDelete.id);
    try {
      const mimeType = fileToDelete.type.split("/")[0];
      const resourceType = (mimeType === "image" || mimeType === "video") ? mimeType : "raw";

      const result = await deleteProjectFileAction({
        projectId,
        fileId: fileToDelete.id,
        publicId: fileToDelete.publicId,
        resourceType,
        uid,
        fileName: fileToDelete.name,
      });
      if (!result.success) {
        throw new Error(result.error || "Failed to delete file.");
      }
    } catch (err: any) {
      console.error("Critical delete error:", err);
      throw err; // Propagate to the modal
    } finally {
      setDeletingId(null);
      setFileToDelete(null);
    }
  };

  /* ── Render ── */
  return (
    <div
      className="space-y-0 animate-fade-in"
      style={{ animationDelay: "200ms", animationFillMode: "both" }}
    >
      {/* ────────── HEADER ────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-8 mb-8">
        <div>
          <h2 className="text-[10px] font-mono uppercase tracking-[0.3em] text-[#444444] mb-3">
            Asset Repository
          </h2>
          <div className="flex items-center gap-4">
            <h3 className="text-2xl font-light text-[#ededed] tracking-tight">
              System Explorer
            </h3>
            <span className="h-4 w-px bg-white/[0.06]" />
            <span className="text-[12px] text-[#555555] font-mono tabular-nums">
              {loading ? "Scanning…" : `${files.length} Indices Found`}
            </span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3 shrink-0">
          {/* View toggle */}
          <div className="flex items-center rounded-lg border border-[#1a1a1a] overflow-hidden">
            <button
              onClick={() => setViewMode("list")}
              className={cn(
                "flex items-center justify-center w-9 h-9 transition-all duration-300",
                viewMode === "list"
                  ? "bg-[#111111] text-[#ededed]"
                  : "bg-transparent text-[#444444] hover:text-[#888888]"
              )}
              title="List View"
            >
              <LayoutList className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode("grid")}
              className={cn(
                "flex items-center justify-center w-9 h-9 transition-all duration-300",
                viewMode === "grid"
                  ? "bg-[#111111] text-[#ededed]"
                  : "bg-transparent text-[#444444] hover:text-[#888888]"
              )}
              title="Grid View"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Upload */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="flex items-center gap-2.5 px-5 h-10 rounded-lg bg-[#111111] hover:bg-[#161616] text-[#ededed] text-[12px] font-medium transition-all duration-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] border border-[#1a1a1a] disabled:opacity-50 group shrink-0"
          >
            {isUploading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#666666]" />
            ) : (
              <Plus className="w-3.5 h-3.5 text-[#666666] group-hover:text-[#aaa] transition-colors" />
            )}
            Import Asset
          </button>
        </div>
      </div>

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleUpload}
        className="hidden"
        accept="image/*,video/*,application/pdf,.csv,.xlsx,.xls,.json,.js,.ts,.html,.css,.txt,.zip,.rar,.7z,.tar,.gz"
      />

      {/* ────────── CONTENT AREA ────────── */}
      <div className="rounded-2xl border border-[#1a1a1a] bg-[#000000] overflow-hidden">
        {loading ? (
          <LoadingSkeleton viewMode={viewMode} />
        ) : files.length === 0 ? (
          <EmptyState />
        ) : viewMode === "list" ? (
          /* ── LIST VIEW ── */
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="border-b border-[#1a1a1a]">
                  <th className="py-4 px-6 text-[9px] font-mono uppercase tracking-[0.25em] text-[#444444] w-[35%]">
                    File Identifier
                  </th>
                  <th className="py-4 px-4 text-[9px] font-mono uppercase tracking-[0.25em] text-[#444444] w-[10%]">
                    Class
                  </th>
                  <th className="py-4 px-4 text-[9px] font-mono uppercase tracking-[0.25em] text-[#444444] w-[12%]">
                    Weight
                  </th>
                  <th className="py-4 px-4 text-[9px] font-mono uppercase tracking-[0.25em] text-[#444444] w-[18%]">
                    Uploader
                  </th>
                  <th className="py-4 px-4 text-[9px] font-mono uppercase tracking-[0.25em] text-[#444444] w-[15%]">
                    Timestamp
                  </th>
                  <th className="py-4 px-6 text-[9px] font-mono uppercase tracking-[0.25em] text-[#444444] w-[10%] text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {files.map((file, index) => {
                  const cat = getFileCategory(file.type);
                  const Icon = cat.icon;
                  const isSelected = selectedId === file.id;

                  return (
                    <tr
                      key={file.id}
                      onClick={() => setSelectedId(isSelected ? null : file.id)}
                      className={cn(
                        "group/row cursor-pointer transition-all duration-300 border-b border-[#0d0d0d] last:border-b-0",
                        isSelected
                          ? "bg-white/[0.03]"
                          : "hover:bg-white/[0.015]"
                      )}
                      style={{ animationDelay: `${index * 40}ms` }}
                    >
                      {/* Identifier */}
                      <td className="py-5 px-6">
                        <div className="flex items-center gap-4">
                          <div
                            className="w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-500 group-hover/row:scale-105 border border-[#1a1a1a]"
                            style={{ backgroundColor: `${cat.accent}08` }}
                          >
                            <Icon
                              className="w-4 h-4 transition-colors duration-300"
                              style={{ color: cat.accent }}
                            />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[13px] font-mono text-[#ededed] truncate group-hover/row:text-white transition-colors duration-300">
                              {file.name}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Class badge */}
                      <td className="py-5 px-4">
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-mono uppercase tracking-wider border transition-colors duration-300"
                          style={{
                            color: cat.accent,
                            borderColor: `${cat.accent}20`,
                            backgroundColor: `${cat.accent}08`,
                          }}
                        >
                          {cat.label}
                        </span>
                      </td>

                      {/* Weight */}
                      <td className="py-5 px-4">
                        <span className="text-[11px] font-mono text-[#555555] tabular-nums group-hover/row:text-[#888888] transition-colors">
                          {formatSize(file.size)}
                        </span>
                      </td>

                      {/* Uploader */}
                      <td className="py-5 px-4">
                        <div className="flex items-center gap-2.5">
                          <UserAvatar
                            name={getMemberName(file.uploadedBy)}
                            photoURL={getMemberPhoto(file.uploadedBy)}
                            size="sm"
                          />
                          <span className="text-[12px] text-[#666666] group-hover/row:text-[#aaaaaa] transition-colors">
                            {getMemberName(file.uploadedBy)}
                          </span>
                        </div>
                      </td>

                      {/* Timestamp */}
                      <td className="py-5 px-4">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[11px] font-mono text-[#555555] group-hover/row:text-[#888888] transition-colors tabular-nums">
                            {format(file.createdAt?.toDate() || new Date(), "dd MMM yyyy")}
                          </span>
                          <span className="text-[9px] font-mono text-[#333333] uppercase tabular-nums">
                            {format(file.createdAt?.toDate() || new Date(), "HH:mm")}
                          </span>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-5 px-6 text-right">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover/row:opacity-100 transition-opacity duration-300">
                          <button
                            onClick={(e) => handleDownload(e, file)}
                            disabled={downloadingId === file.id}
                            className={cn(
                              "inline-flex items-center justify-center p-2 rounded-lg transition-all duration-300",
                              downloadingId === file.id
                                ? "text-[#555555] cursor-not-allowed"
                                : "text-[#444444] hover:text-[#ededed] hover:bg-white/[0.05]"
                            )}
                            title="Download Asset"
                          >
                            {downloadingId === file.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Download className="w-3.5 h-3.5" />
                            )}
                          </button>
                          <button
                            onClick={(e) => handleDelete(e, file)}
                            disabled={deletingId === file.id}
                            className={cn(
                              "inline-flex items-center justify-center p-2 rounded-lg transition-all duration-300",
                              deletingId === file.id
                                ? "text-[#555555] cursor-not-allowed"
                                : "text-[#444444] hover:text-[#E57A7A] hover:bg-[#E57A7A]/[0.08]"
                            )}
                            title="Delete Asset"
                          >
                            {deletingId === file.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          /* ── GRID VIEW ── */
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-px bg-[#1a1a1a]">
            {files.map((file, index) => {
              const cat = getFileCategory(file.type);
              const Icon = cat.icon;
              const isSelected = selectedId === file.id;

              return (
                <div
                  key={file.id}
                  onClick={() => setSelectedId(isSelected ? null : file.id)}
                  className={cn(
                    "group/card relative bg-[#000000] p-6 cursor-pointer transition-all duration-500 flex flex-col items-center text-center",
                    isSelected
                      ? "bg-white/[0.03]"
                      : "hover:bg-white/[0.015]"
                  )}
                  style={{ animationDelay: `${index * 60}ms` }}
                >
                  {/* Icon */}
                  <div
                    className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5 transition-all duration-500 group-hover/card:scale-110 border border-[#1a1a1a]"
                    style={{ backgroundColor: `${cat.accent}06` }}
                  >
                    <Icon
                      className="w-6 h-6 transition-colors duration-500"
                      style={{ color: cat.accent }}
                    />
                  </div>

                  {/* Name */}
                  <p className="text-[12px] font-mono text-[#ededed] truncate w-full mb-1.5 group-hover/card:text-white transition-colors">
                    {file.name}
                  </p>

                  {/* Meta line */}
                  <div className="flex items-center gap-2 justify-center">
                    <span
                      className="text-[8px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border"
                      style={{
                        color: cat.accent,
                        borderColor: `${cat.accent}20`,
                        backgroundColor: `${cat.accent}08`,
                      }}
                    >
                      {cat.label}
                    </span>
                    <span className="text-[10px] font-mono text-[#444444] tabular-nums">
                      {formatSize(file.size)}
                    </span>
                  </div>

                    {/* Actions */}
                    <div className="absolute top-3 right-3 flex items-center gap-1 opacity-0 group-hover/card:opacity-100 transition-opacity duration-300">
                      <button
                        onClick={(e) => handleDownload(e, file)}
                        disabled={downloadingId === file.id}
                        className={cn(
                          "inline-flex items-center justify-center w-7 h-7 rounded-lg transition-all duration-300",
                          downloadingId === file.id
                            ? "text-[#555555] cursor-not-allowed"
                            : "text-[#444444] hover:text-[#ededed] hover:bg-white/[0.08]"
                        )}
                        title="Download"
                      >
                        {downloadingId === file.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Download className="w-3 h-3" />
                        )}
                      </button>
                      <button
                        onClick={(e) => handleDelete(e, file)}
                        disabled={deletingId === file.id}
                        className={cn(
                          "inline-flex items-center justify-center w-7 h-7 rounded-lg transition-all duration-300",
                          deletingId === file.id
                            ? "text-[#555555] cursor-not-allowed"
                            : "text-[#444444] hover:text-[#E57A7A] hover:bg-[#E57A7A]/[0.08]"
                        )}
                        title="Delete"
                      >
                        {deletingId === file.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Trash2 className="w-3 h-3" />
                        )}
                      </button>
                    </div>

                  {/* Selection indicator */}
                  {isSelected && (
                    <div
                      className="absolute inset-x-0 bottom-0 h-[2px] transition-all duration-500"
                      style={{ backgroundColor: cat.accent }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ────────── TELEMETRY FOOTER ────────── */}
        <div className="border-t border-[#1a1a1a] px-6 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#85C89B] opacity-40" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#85C89B]" />
              </span>
              <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-[#555555]">
                Status: <span className="text-[#85C89B]">Operational</span>
              </span>
            </div>
            <span className="h-3 w-px bg-[#1a1a1a]" />
            <span className="text-[9px] font-mono uppercase tracking-[0.15em] text-[#333333]">
              System Telemetry
            </span>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-[10px] font-mono text-[#444444] tabular-nums">
              {files.length} Active Node{files.length !== 1 ? "s" : ""}
            </span>
            <span className="h-3 w-px bg-[#1a1a1a]" />
            <span className="text-[10px] font-mono text-[#444444] tabular-nums">
              {formatSize(totalStorage)} Total Storage
            </span>
          </div>
        </div>
      </div>

      {/* ────────── DELETE CONFIRM ────────── */}
      <DeleteFileDialog
        open={!!fileToDelete}
        onOpenChange={(open) => !open && setFileToDelete(null)}
        file={fileToDelete}
        onConfirm={executeDelete}
      />

      <SuccessModal
        open={showSuccess}
        onOpenChange={setShowSuccess}
        title="Asset Uploaded"
        description="The file has been successfully indexed in the system repository."
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function LoadingSkeleton({ viewMode }: { viewMode: ViewMode }) {
  if (viewMode === "grid") {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-px bg-[#1a1a1a]">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="bg-[#000000] p-6 flex flex-col items-center animate-pulse">
            <div className="w-14 h-14 rounded-2xl bg-white/[0.03] mb-5" />
            <div className="h-3 w-20 bg-white/[0.03] rounded mb-2" />
            <div className="h-2.5 w-14 bg-white/[0.02] rounded" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="divide-y divide-[#0d0d0d]">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-6 py-5 animate-pulse">
          <div className="w-9 h-9 rounded-lg bg-white/[0.03]" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-48 bg-white/[0.03] rounded" />
            <div className="h-2.5 w-24 bg-white/[0.02] rounded" />
          </div>
          <div className="h-3 w-12 bg-white/[0.02] rounded" />
          <div className="h-3 w-16 bg-white/[0.02] rounded" />
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="py-24 flex flex-col items-center justify-center">
      <div className="w-14 h-14 bg-[#060606] rounded-2xl flex items-center justify-center ring-1 ring-[#1a1a1a] mb-6">
        <HardDrive className="w-6 h-6 text-[#222222]" />
      </div>
      <p className="text-[13px] font-mono text-[#ededed] mb-1.5">
        No indexed nodes.
      </p>
      <p className="text-[12px] font-mono text-[#444444] max-w-xs text-center leading-relaxed">
        Assets imported into this project thread will surface here as searchable system nodes.
      </p>
    </div>
  );
}
