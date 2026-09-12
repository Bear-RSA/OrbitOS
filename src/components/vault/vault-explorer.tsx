"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Plus,
  Download,
  Trash2,
  Pencil,
  Lock,
  Users,
  ShieldCheck,
  FileText,
  Image as ImageIcon,
  Film,
  FileArchive,
  FileCode,
  FileSpreadsheet,
  File as FileIcon,
  Search,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils/classnames";
import { SIGNAL } from "@/lib/utils/signal-colors";
import { Loader } from "@/components/ui/loader";
import { Input } from "@/components/ui/input";
import { DestructiveActionModal } from "@/components/ui/destructive-action-modal";
import { VaultDocumentDialog } from "./vault-document-dialog";
import { subscribeToVault, subscribeToVaultUsage } from "@/lib/queries/vault";
import {
  deleteVaultDocumentAction,
  getVaultDownloadUrlAction,
  updateVaultDocumentAction,
} from "@/app/actions/vault";
import { depositToVault } from "@/lib/vault/deposit";
import {
  VAULT_CATEGORIES,
  VAULT_CATEGORY_ORDER,
  EMPTY_VAULT_USAGE,
  type VaultCategory,
  type VaultDocument,
  type VaultUsage,
} from "@/types/vault";
import { formatBytes } from "@/lib/vault/ceiling";

/* ------------------------------------------------------------------ */
/*  The Vault                                                          */
/*                                                                     */
/*  Reads as a shelf rather than a drive: the filter rail is the set   */
/*  of shelves a company actually has, and every row states its        */
/*  clearance in the open. A lock that is only enforced and never      */
/*  shown teaches people nothing about what they are about to share.   */
/* ------------------------------------------------------------------ */

type CategoryFilter = VaultCategory | "all";

function fileCategory(type: string): { label: string; icon: typeof FileText; accent: string } {
  const t = (type || "").toLowerCase();
  if (t.includes("pdf")) return { label: "PDF", icon: FileText, accent: SIGNAL.red };
  if (t.startsWith("image/")) return { label: "IMG", icon: ImageIcon, accent: SIGNAL.ink };
  if (t.startsWith("video/")) return { label: "VID", icon: Film, accent: SIGNAL.blue };
  if (/(zip|rar|tar|gz|7z)/.test(t))
    return { label: "ARC", icon: FileArchive, accent: SIGNAL.amber };
  if (/(sheet|excel|csv)/.test(t))
    return { label: "XLS", icon: FileSpreadsheet, accent: SIGNAL.green };
  if (/(json|xml|javascript|html|css)/.test(t))
    return { label: "CODE", icon: FileCode, accent: SIGNAL.blue };
  if (/(word|document|rtf|text)/.test(t))
    return { label: "DOC", icon: FileText, accent: SIGNAL.ink };
  return { label: "FILE", icon: FileIcon, accent: SIGNAL.muted };
}

interface VaultExplorerProps {
  orgId: string;
  uid: string;
  isOwner: boolean;
  /** Fired when the live subscription is refused — the passcode unlock
   *  behind it expired mid-session. Re-shows the passcode gate rather
   *  than leaving the shelf looking merely empty. */
  onPermissionDenied?: () => void;
}

export function VaultExplorer({ orgId, uid, isOwner, onPermissionDenied }: VaultExplorerProps) {
  const [documents, setDocuments] = useState<VaultDocument[]>([]);
  const [usage, setUsage] = useState<VaultUsage>(EMPTY_VAULT_USAGE);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<CategoryFilter>("all");
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [depositOpen, setDepositOpen] = useState(false);
  const [refiling, setRefiling] = useState<VaultDocument | null>(null);
  const [purging, setPurging] = useState<VaultDocument | null>(null);

  /* ── Subscriptions ── */
  useEffect(() => {
    if (!orgId) return;
    setLoading(true);
    const unsubDocuments = subscribeToVault(
      orgId,
      { uid, isOwner },
      (next) => {
        setDocuments(next);
        setLoading(false);
      },
      (error) => {
        setLoading(false);
        // The passcode unlock behind this subscription expired — the
        // rules check the same record `verifyVaultPasscodeAction` writes.
        if (error.name === "FirebaseError" && (error as { code?: string }).code === "permission-denied") {
          onPermissionDenied?.();
        }
      }
    );
    const unsubUsage = subscribeToVaultUsage(orgId, setUsage);
    return () => {
      unsubDocuments();
      unsubUsage();
    };
  }, [orgId, uid, isOwner, onPermissionDenied]);

  /* ── Shelf counts drive the rail, so an empty shelf can say so ── */
  const counts = useMemo(() => {
    const tally = new Map<VaultCategory, number>();
    for (const document of documents) {
      tally.set(document.category, (tally.get(document.category) ?? 0) + 1);
    }
    return tally;
  }, [documents]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return documents.filter((document) => {
      if (filter !== "all" && document.category !== filter) return false;
      if (!needle) return true;
      return (
        document.name.toLowerCase().includes(needle) ||
        (document.note || "").toLowerCase().includes(needle)
      );
    });
  }, [documents, filter, search]);

  /* ── File a new document ── */
  const deposit = useCallback(
    async (input: {
      file: File | null;
      name: string;
      note: string;
      category: VaultCategory;
      clearance: "INTERNAL" | "RESTRICTED";
    }) => {
      if (!input.file) throw new Error("Choose a file first.");
      await depositToVault({ ...input, file: input.file });
      setNotice(`${input.name} is on the ${VAULT_CATEGORIES[input.category].label} shelf.`);
    },
    []
  );

  /* ── Re-file ── */
  const refile = useCallback(
    async (input: {
      name: string;
      note: string;
      category: VaultCategory;
      clearance: "INTERNAL" | "RESTRICTED";
    }) => {
      if (!refiling) return;
      const result = await updateVaultDocumentAction({
        documentId: refiling.id,
        name: input.name,
        note: input.note,
        category: input.category,
        clearance: input.clearance,
      });
      if (!result.success) throw new Error(result.error);
      setNotice(`${input.name} updated.`);
    },
    [refiling]
  );

  /* ── Download ── */
  const download = useCallback(async (document: VaultDocument) => {
    setBusyId(document.id);
    setNotice(null);
    try {
      const result = await getVaultDownloadUrlAction({ documentId: document.id });
      if (!result.success || !result.url) {
        setNotice(result.success ? "Could not open this document." : result.error);
        return;
      }
      const anchor = window.document.createElement("a");
      anchor.href = result.url;
      anchor.rel = "noopener noreferrer";
      window.document.body.appendChild(anchor);
      anchor.click();
      window.document.body.removeChild(anchor);
    } finally {
      setBusyId(null);
    }
  }, []);

  /* ── Purge ── */
  const purge = useCallback(async () => {
    if (!purging) return;
    const result = await deleteVaultDocumentAction({ documentId: purging.id });
    if (!result.success) throw new Error(result.error);
    setPurging(null);
  }, [purging]);

  const canManage = (document: VaultDocument) =>
    isOwner || document.uploadedBy === uid;

  return (
    <div className="animate-fade-in space-y-0" style={{ animationFillMode: "both" }}>
      {/* ────────── HEADER ────────── */}
      <div className="mb-8 flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
        <div>
          <h2 className="mb-3 font-mono text-[10px] uppercase tracking-[0.3em] text-ink-dim">
            Company Records
          </h2>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <h3 className="text-2xl font-light tracking-tight text-ink">The Vault</h3>
            <span className="hidden h-4 w-px bg-surface-control sm:block" />
            <span className="font-mono text-[12px] tabular-nums text-ink-dim">
              {loading
                ? "Opening…"
                : `${usage.documents} held · ${formatBytes(usage.bytes)}`}
            </span>
          </div>
        </div>

        <button
          onClick={() => setDepositOpen(true)}
          className="group flex h-10 shrink-0 items-center gap-2.5 rounded-lg border border-line/[0.06] bg-surface-control px-5 text-[12px] font-medium text-ink shadow-card transition-all duration-300"
        >
          <Plus className="h-3.5 w-3.5 text-ink-dim transition-colors group-hover:text-ink-muted" />
          File Document
        </button>
      </div>

      {/* ────────── FILTER RAIL ────────── */}
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip
            active={filter === "all"}
            label="All"
            count={documents.length}
            onSelect={() => setFilter("all")}
          />
          {VAULT_CATEGORY_ORDER.map((id) => (
            <Chip
              key={id}
              active={filter === id}
              label={VAULT_CATEGORIES[id].label}
              count={counts.get(id) ?? 0}
              onSelect={() => setFilter(id)}
            />
          ))}
        </div>

        <div className="relative w-full lg:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-dim" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search the vault"
            className="h-9 pl-9 text-[12px]"
          />
        </div>
      </div>

      {filter !== "all" && (
        <p className="mb-5 text-[11px] leading-relaxed text-ink-dim">
          {VAULT_CATEGORIES[filter].description}
        </p>
      )}

      {notice && (
        <div className="mb-5 flex items-center gap-2.5 rounded-lg border border-line/[0.06] bg-surface-sunken px-4 py-3">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-orbit-green" />
          <p className="text-[12px] text-ink-muted">{notice}</p>
          <button
            onClick={() => setNotice(null)}
            className="ml-auto font-mono text-[10px] uppercase tracking-[0.18em] text-ink-dim transition-colors hover:text-ink-muted"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ────────── SHELF ────────── */}
      <div className="overflow-hidden rounded-2xl border border-line/[0.06] bg-surface-card">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader size={22} />
          </div>
        ) : visible.length === 0 ? (
          <EmptyShelf
            filtered={documents.length > 0}
            onFile={() => setDepositOpen(true)}
          />
        ) : (
          <ul className="divide-y divide-line/[0.05]">
            {visible.map((document) => {
              const kind = fileCategory(document.type);
              const Icon = kind.icon;
              const restricted = document.clearance === "RESTRICTED";
              const manageable = canManage(document);

              return (
                <li
                  key={document.id}
                  className="group/row flex items-center gap-4 px-5 py-4 transition-colors duration-300 hover:bg-surface-sunken sm:px-6"
                >
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-line/[0.06] transition-transform duration-500 group-hover/row:scale-105"
                    style={{ backgroundColor: `${kind.accent}08` }}
                  >
                    <Icon className="h-4 w-4" style={{ color: kind.accent }} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                      <p className="truncate text-[13px] text-ink">{document.name}</p>
                      <ClearanceTag restricted={restricted} />
                    </div>
                    <p className="mt-1 truncate font-mono text-[11px] text-ink-dim">
                      {VAULT_CATEGORIES[document.category]?.label ?? "Other"}
                      {" · "}
                      {formatBytes(document.size)}
                      {" · "}
                      {document.uploadedByName || "System"}
                      {document.createdAt?.toDate
                        ? ` · ${format(document.createdAt.toDate(), "dd MMM yyyy")}`
                        : ""}
                    </p>
                    {document.note && (
                      <p className="mt-1.5 line-clamp-2 text-[11px] leading-relaxed text-ink-dim">
                        {document.note}
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <RowAction
                      label={`Download ${document.name}`}
                      icon={Download}
                      busy={busyId === document.id}
                      onSelect={() => download(document)}
                    />
                    {manageable && (
                      <>
                        <RowAction
                          label={`Re-file ${document.name}`}
                          icon={Pencil}
                          onSelect={() => setRefiling(document)}
                        />
                        <RowAction
                          label={`Purge ${document.name}`}
                          icon={Trash2}
                          destructive
                          onSelect={() => setPurging(document)}
                        />
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* ────────── DIALOGS ────────── */}
      <VaultDocumentDialog
        open={depositOpen}
        onOpenChange={setDepositOpen}
        initialCategory={filter === "all" ? undefined : filter}
        onSubmit={deposit}
      />

      <VaultDocumentDialog
        open={Boolean(refiling)}
        onOpenChange={(open) => !open && setRefiling(null)}
        document={refiling}
        onSubmit={refile}
      />

      {purging && (
        <DestructiveActionModal
          isOpen={Boolean(purging)}
          onClose={() => setPurging(null)}
          onConfirm={purge}
          entityName={purging.name}
          title="Purge from the Vault"
          description={
            <>
              You are about to permanently remove{" "}
              <span className="font-bold text-destructive">{purging.name}</span> from
              the company vault.
            </>
          }
          warningMessage="The record and the stored file are both destroyed. If this is the only copy the company holds, it is gone."
          actionLabel="Purge Document"
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Pieces                                                             */
/* ------------------------------------------------------------------ */

function Chip({
  active,
  label,
  count,
  onSelect,
}: {
  active: boolean;
  label: string;
  count: number;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      aria-pressed={active}
      className={cn(
        "inline-flex h-8 items-center gap-2 rounded-lg px-3 transition-all duration-300",
        "font-mono text-[10px] uppercase tracking-[0.16em]",
        active
          ? "bg-surface-control text-ink ring-1 ring-inset ring-line/[0.08]"
          : "text-ink-dim hover:bg-surface-control/60 hover:text-ink-muted"
      )}
    >
      {label}
      <span className="tabular-nums text-ink-dim">{count}</span>
    </button>
  );
}

function ClearanceTag({ restricted }: { restricted: boolean }) {
  const Icon = restricted ? Lock : Users;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded px-1.5 py-0.5",
        "font-mono text-[9px] uppercase tracking-[0.16em]",
        restricted
          ? "bg-orbit-amber/[0.08] text-orbit-amber ring-1 ring-inset ring-orbit-amber/20"
          : "bg-surface-control text-ink-dim ring-1 ring-inset ring-line/[0.06]"
      )}
    >
      <Icon className="h-2.5 w-2.5" />
      {restricted ? "Restricted" : "Internal"}
    </span>
  );
}

function RowAction({
  label,
  icon: Icon,
  onSelect,
  busy,
  destructive,
}: {
  label: string;
  icon: typeof Download;
  onSelect: () => void;
  busy?: boolean;
  destructive?: boolean;
}) {
  return (
    <button
      onClick={onSelect}
      disabled={busy}
      aria-label={label}
      title={label}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-300 disabled:opacity-40",
        destructive
          ? "text-ink-dim hover:bg-orbit-red/[0.08] hover:text-orbit-red"
          : "text-ink-dim hover:bg-surface-control hover:text-ink"
      )}
    >
      {busy ? <Loader size={14} stroke={2} /> : <Icon className="h-3.5 w-3.5" />}
    </button>
  );
}

function EmptyShelf({
  filtered,
  onFile,
}: {
  filtered: boolean;
  onFile: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
      <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl border border-line/[0.06] bg-surface-sunken">
        <Lock className="h-4.5 w-4.5 text-ink-dim" />
      </div>
      <p className="text-[13px] text-ink">
        {filtered ? "Nothing on this shelf" : "The vault is empty"}
      </p>
      <p className="mt-2 max-w-sm text-[12px] leading-relaxed text-ink-dim">
        {filtered
          ? "Nothing here matches what you are looking for, or it is filed under a different shelf."
          : "Registration certificates, financials, tax returns, HR paperwork — the documents the company keeps whether or not a project is running."}
      </p>
      {!filtered && (
        <button
          onClick={onFile}
          className="mt-6 inline-flex h-9 items-center gap-2 rounded-lg border border-line/[0.06] bg-surface-control px-4 text-[12px] text-ink transition-colors duration-300"
        >
          <Plus className="h-3.5 w-3.5 text-ink-dim" />
          File the first document
        </button>
      )}
    </div>
  );
}
