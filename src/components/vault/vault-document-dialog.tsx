"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Lock, Users, Upload, Paperclip, AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils/classnames";
import {
  VAULT_CATEGORIES,
  VAULT_CATEGORY_ORDER,
  DEFAULT_VAULT_CATEGORY,
  type VaultCategory,
  type VaultClearance,
  type VaultDocument,
} from "@/types/vault";
import { formatBytes, HARD_MAX_FILE_BYTES, withinFileCeiling } from "@/lib/vault/ceiling";

/* ------------------------------------------------------------------ */
/*  Filing a document                                                  */
/*                                                                     */
/*  One dialog for both filing and re-filing, because the decisions    */
/*  are the same ones: which shelf, and who may read it. Only the file */
/*  picker differs, and it is absent when re-filing — the bytes never  */
/*  move, so replacing a document means purging it and filing the new  */
/*  one, which keeps the audit trail honest about what happened.       */
/* ------------------------------------------------------------------ */

interface VaultDocumentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present when re-filing. Absent when filing something new. */
  document?: VaultDocument | null;
  /** Pre-selects the shelf the operator was looking at. */
  initialCategory?: VaultCategory;
  /**
   * A file the caller already holds, filed instead of one picked here.
   *
   * The transcript of a meeting arrives this way: it was generated
   * rather than chosen, so the picker would be asking a question with
   * one possible answer. Everything else about filing it — the shelf,
   * the label, the clearance — is still the operator's to decide.
   */
  presetFile?: File | null;
  onSubmit: (input: {
    file: File | null;
    name: string;
    note: string;
    category: VaultCategory;
    clearance: VaultClearance;
  }) => Promise<void>;
}

export function VaultDocumentDialog({
  open,
  onOpenChange,
  document: existing,
  initialCategory,
  presetFile = null,
  onSubmit,
}: VaultDocumentDialogProps) {
  const isRefile = Boolean(existing);

  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [category, setCategory] = useState<VaultCategory>(DEFAULT_VAULT_CATEGORY);
  const [clearance, setClearance] = useState<VaultClearance>("RESTRICTED");
  /* Tracks whether the operator has touched the clearance control. Until
     they do, changing the shelf moves the clearance with it — after they
     do, it stays put, because an explicit choice should not be quietly
     revised by a later category change. */
  const [clearanceTouched, setClearanceTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* Reset on every open so a cancelled deposit does not seed the next. */
  useEffect(() => {
    if (!open) return;
    const startingCategory =
      existing?.category ?? initialCategory ?? DEFAULT_VAULT_CATEGORY;
    setFile(presetFile);
    setName(existing?.name ?? presetFile?.name ?? "");
    setNote(existing?.note ?? "");
    setCategory(startingCategory);
    setClearance(
      existing?.clearance ?? VAULT_CATEGORIES[startingCategory].defaultClearance
    );
    setClearanceTouched(Boolean(existing));
    setBusy(false);
    setError(null);
  }, [open, existing, initialCategory, presetFile]);

  const chooseCategory = (next: VaultCategory) => {
    setCategory(next);
    if (!clearanceTouched) setClearance(VAULT_CATEGORIES[next].defaultClearance);
  };

  const chooseFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const picked = event.target.files?.[0] ?? null;
    setError(null);
    if (!picked) return setFile(null);

    /* Checked here as well as on the server so a 100MB mistake is caught
       before it is uploaded, not after. */
    if (!withinFileCeiling(picked.size)) {
      setFile(null);
      setError(
        `Files are capped at ${formatBytes(HARD_MAX_FILE_BYTES)}. Attach anything larger to the project it belongs to.`
      );
      return;
    }

    setFile(picked);
    if (!name.trim()) setName(picked.name);
  };

  const canSubmit = useMemo(() => {
    if (busy) return false;
    if (!name.trim()) return false;
    return isRefile || Boolean(file);
  }, [busy, name, file, isRefile]);

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ file, name: name.trim(), note: note.trim(), category, clearance });
      onOpenChange(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Something went wrong. Try again."
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isRefile ? "Re-file Document" : "File a Document"}</DialogTitle>
          <DialogDescription>
            {isRefile
              ? "Change where this sits and who is cleared to read it."
              : "Company records live here for good — not tied to any project."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* ── What is being filed, when the caller brought it ── */}
          {!isRefile && presetFile && (
            <div className="space-y-2">
              <label className="text-[9px] font-mono uppercase tracking-[0.25em] text-ink-dim">
                Document
              </label>
              <div className="flex w-full items-center gap-3 rounded-lg border border-line/[0.12] bg-surface-sunken px-4 py-4">
                <Paperclip className="h-4 w-4 shrink-0 text-ink-muted" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-[12px] text-ink">
                    {presetFile.name}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-ink-dim">
                    {formatBytes(presetFile.size)}
                  </span>
                </span>
              </div>
            </div>
          )}

          {/* ── File picker (new deposits only) ── */}
          {!isRefile && !presetFile && (
            <div className="space-y-2">
              <label className="text-[9px] font-mono uppercase tracking-[0.25em] text-ink-dim">
                Document
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept="*/*"
                onChange={chooseFile}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={busy}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg border border-dashed px-4 py-4 text-left",
                  "transition-colors duration-300 disabled:opacity-50",
                  file
                    ? "border-line/[0.12] bg-surface-sunken"
                    : "border-line/[0.1] hover:border-line/[0.2] hover:bg-surface-sunken/60"
                )}
              >
                {file ? (
                  <Paperclip className="h-4 w-4 shrink-0 text-ink-muted" />
                ) : (
                  <Upload className="h-4 w-4 shrink-0 text-ink-dim" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-[12px] text-ink">
                    {file ? file.name : "Choose a file"}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-ink-dim">
                    {file
                      ? formatBytes(file.size)
                      : `Any format, up to ${formatBytes(HARD_MAX_FILE_BYTES)}`}
                  </span>
                </span>
              </button>
            </div>
          )}

          {/* ── Label ── */}
          <div className="space-y-2">
            <label
              htmlFor="vault-name"
              className="text-[9px] font-mono uppercase tracking-[0.25em] text-ink-dim"
            >
              Label
            </label>
            <Input
              id="vault-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Annual Financial Statements 2025"
              disabled={busy}
            />
          </div>

          {/* ── Shelf ── */}
          <div className="space-y-2">
            <label className="text-[9px] font-mono uppercase tracking-[0.25em] text-ink-dim">
              Shelf
            </label>
            <Select
              value={category}
              onValueChange={(v) => chooseCategory(v as VaultCategory)}
              disabled={busy}
            >
              <SelectTrigger className="h-10 text-[12px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VAULT_CATEGORY_ORDER.map((id) => (
                  <SelectItem key={id} value={id} className="text-[12px]">
                    {VAULT_CATEGORIES[id].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] leading-relaxed text-ink-dim">
              {VAULT_CATEGORIES[category].description}
            </p>
          </div>

          {/* ── Clearance ── */}
          <div className="space-y-2">
            <label className="text-[9px] font-mono uppercase tracking-[0.25em] text-ink-dim">
              Clearance
            </label>
            <div className="grid grid-cols-2 gap-2">
              <ClearanceOption
                active={clearance === "RESTRICTED"}
                icon={Lock}
                title="Restricted"
                caption="Owners, and you"
                onSelect={() => {
                  setClearance("RESTRICTED");
                  setClearanceTouched(true);
                }}
                disabled={busy}
              />
              <ClearanceOption
                active={clearance === "INTERNAL"}
                icon={Users}
                title="Internal"
                caption="Everyone in the workspace"
                onSelect={() => {
                  setClearance("INTERNAL");
                  setClearanceTouched(true);
                }}
                disabled={busy}
              />
            </div>
          </div>

          {/* ── Note ── */}
          <div className="space-y-2">
            <label
              htmlFor="vault-note"
              className="text-[9px] font-mono uppercase tracking-[0.25em] text-ink-dim"
            >
              Note <span className="normal-case tracking-normal">(optional)</span>
            </label>
            <Textarea
              id="vault-note"
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 500))}
              placeholder="Period covered, who signed it, where the original lives."
              rows={2}
              disabled={busy}
            />
          </div>

          {error && (
            <div className="flex items-start gap-2.5 rounded-lg border border-orbit-red/20 bg-orbit-red/[0.06] px-3.5 py-3">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-orbit-red" />
              <p className="text-[12px] leading-relaxed text-ink-muted">{error}</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button onClick={submit} disabled={!canSubmit} isLoading={busy}>
            {isRefile ? "Save Changes" : "File Document"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */

function ClearanceOption({
  active,
  icon: Icon,
  title,
  caption,
  onSelect,
  disabled,
}: {
  active: boolean;
  icon: typeof Lock;
  title: string;
  caption: string;
  onSelect: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        "rounded-lg border px-3.5 py-3 text-left transition-all duration-300 disabled:opacity-50",
        active
          ? "border-line/[0.14] bg-surface-control"
          : "border-line/[0.06] bg-transparent hover:bg-surface-sunken/60"
      )}
    >
      <span className="flex items-center gap-2">
        <Icon
          className={cn("h-3.5 w-3.5", active ? "text-ink" : "text-ink-dim")}
        />
        <span
          className={cn(
            "font-mono text-[10px] uppercase tracking-[0.18em]",
            active ? "text-ink" : "text-ink-dim"
          )}
        >
          {title}
        </span>
      </span>
      <span className="mt-1.5 block text-[11px] leading-snug text-ink-dim">
        {caption}
      </span>
    </button>
  );
}
