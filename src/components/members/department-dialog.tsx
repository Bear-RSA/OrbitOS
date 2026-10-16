"use client";

import { useEffect, useMemo, useState } from "react";
import { Network, PencilLine, Search } from "lucide-react";

import { createDepartmentAction, renameDepartmentAction } from "@/app/actions/team-structure";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { DIALOG_FOOTER_CLASS, DialogHeading, DialogNotice } from "@/components/ui/dialog-parts";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DepartmentGlass, DepartmentIcon, tintStyle } from "@/components/ui/department-glass";
import { ICON_NAMES, isKnownIcon, LucideIcon } from "@/components/ui/lucide-icon";
import { DEFAULT_DEPARTMENT_ICON, MAX_DEPARTMENT_DESCRIPTION } from "@/lib/members/department-details";
import { DEPARTMENT_TINTS, TINT_KEYS, tintOf, type DepartmentTint } from "@/lib/members/department-tint";
import { MAX_DEPARTMENT_NAME_LENGTH } from "@/lib/members/hierarchy";
import { cn } from "@/lib/utils/classnames";
import type { Department } from "@/types/department";

/* ------------------------------------------------------------------ */
/*  New department / Edit department                                   */
/*                                                                     */
/*  Name, one line on what it does, an icon from the whole Lucide set  */
/*  and a colour, with the card previewed as it will look on the       */
/*  chart. The icon grid shows a short list of likely ones until you   */
/*  search; a search covers every Lucide icon, and each one loads only */
/*  when it is drawn.                                                  */
/* ------------------------------------------------------------------ */

/** Where most departments will find theirs. Anything Lucide lacks is skipped. */
const SUGGESTED_ICONS = [
  "network", "rocket", "briefcase", "building-2", "code", "terminal", "cpu", "server",
  "database", "cloud", "shield", "lock", "palette", "pen-tool", "brush", "camera",
  "megaphone", "mail", "phone", "headphones", "message-circle", "users", "user-plus", "handshake",
  "heart-pulse", "stethoscope", "graduation-cap", "book-open", "scale", "gavel", "landmark", "wallet",
  "banknote", "receipt", "calculator", "piggy-bank", "shopping-cart", "store", "package", "truck",
  "warehouse", "factory", "wrench", "hammer", "hard-hat", "leaf", "globe", "plane",
  "compass", "target", "trophy", "lightbulb", "flask-conical", "microscope", "sparkles", "zap",
  "trending-up", "calendar", "clipboard-list", "file-text", "folder", "settings",
].filter(isKnownIcon);

const MAX_RESULTS = 72;

export function DepartmentDialog({
  open,
  department,
  onClose,
  onSaved,
}: {
  open: boolean;
  department: Department | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState<string>(DEFAULT_DEPARTMENT_ICON);
  const [query, setQuery] = useState("");
  const [tint, setTint] = useState<DepartmentTint>("ocean");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(department?.name ?? "");
      setDescription(department?.description ?? "");
      setIcon(department?.icon && isKnownIcon(department.icon) ? department.icon : DEFAULT_DEPARTMENT_ICON);
      setQuery("");
      setTint(department ? tintOf(department) : TINT_KEYS[Math.floor(Math.random() * (TINT_KEYS.length - 1))]);
      setError(null);
    }
  }, [open, department]);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase().replace(/\s+/g, "-");
    if (!needle) return { icons: SUGGESTED_ICONS as string[], more: 0 };
    const all = ICON_NAMES.filter((n) => n.includes(needle));
    return { icons: all.slice(0, MAX_RESULTS) as string[], more: Math.max(0, all.length - MAX_RESULTS) };
  }, [query]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const details = { name, description, icon, tint };
      const result = department
        ? // The lead title isn't edited here any more; keep whatever it was.
          await renameDepartmentAction({ departmentId: department.id, leadTitle: department.leadTitle, ...details })
        : await createDepartmentAction(details);
      if (!result.success) {
        setError(result.error);
        return;
      }
      await onSaved();
      onClose();
    } catch (err) {
      console.error("[DepartmentDialog] Save failed:", err);
      setError("Something went wrong. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-[520px]">
        <DialogHeading
          icon={department ? PencilLine : Network}
          title={department ? "Edit department" : "New department"}
          description={department ? "Everyone in it stays where they are." : "Wire people into it on the chart once it's made."}
        />

        <form onSubmit={submit}>
          <div className="space-y-5">
            {error && <DialogNotice tone="red">{error}</DialogNotice>}

            <div className="space-y-2.5">
              <Label htmlFor="department-name" className="block text-[12px] text-ink-dim">
                Name
              </Label>
              <Input
                id="department-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={MAX_DEPARTMENT_NAME_LENGTH}
                placeholder="Client Delivery"
                disabled={saving}
                autoFocus
              />
            </div>

            <div className="space-y-2.5">
              <div className="flex items-baseline justify-between">
                <Label htmlFor="department-description" className="block text-[12px] text-ink-dim">
                  Description
                </Label>
                <span className="font-mono text-[11px] tabular-nums text-ink-faint">
                  {description.length}/{MAX_DEPARTMENT_DESCRIPTION}
                </span>
              </div>
              <Input
                id="department-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={MAX_DEPARTMENT_DESCRIPTION}
                placeholder="Builds and ships the product"
                disabled={saving}
              />
            </div>

            <div className="space-y-2.5" style={tintStyle(tint)}>
              <Label htmlFor="department-icon-search" className="block text-[12px] text-ink-dim">
                Icon
              </Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-dim" aria-hidden />
                <Input
                  id="department-icon-search"
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={`Search ${ICON_NAMES.length.toLocaleString()} icons`}
                  disabled={saving}
                  className="pl-11"
                />
              </div>
              <div
                role="radiogroup"
                aria-label="Department icon"
                className="custom-scrollbar grid max-h-[176px] grid-cols-8 gap-1.5 overflow-y-auto rounded-xl bg-surface-sunken/50 p-2 ring-1 ring-inset ring-line/[0.06]"
              >
                {results.icons.map((name) => (
                  <button
                    key={name}
                    type="button"
                    role="radio"
                    aria-checked={icon === name}
                    aria-label={name.replace(/-/g, " ")}
                    title={name.replace(/-/g, " ")}
                    disabled={saving}
                    onClick={() => setIcon(name)}
                    className={cn(
                      "flex aspect-square items-center justify-center rounded-lg transition-colors duration-quick",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
                      icon === name
                        ? "bg-[rgb(var(--tint)/0.2)] text-[rgb(var(--tint))] ring-1 ring-inset ring-[rgb(var(--tint)/0.5)]"
                        : "text-ink-muted hover:bg-surface-hover hover:text-ink"
                    )}
                  >
                    <LucideIcon icon={name} className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                  </button>
                ))}
                {results.icons.length === 0 && (
                  <p className="col-span-8 py-4 text-center text-[12px] text-ink-dim">No icon by that name.</p>
                )}
              </div>
              {results.more > 0 && (
                <p className="text-[11px] text-ink-dim">{results.more} more. Keep typing to narrow it down.</p>
              )}
            </div>

            <div className="space-y-2.5">
              <Label id="department-tint-label" className="block text-[12px] text-ink-dim">
                Colour
              </Label>
              <div role="radiogroup" aria-labelledby="department-tint-label" className="flex flex-wrap gap-2.5">
                {TINT_KEYS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    role="radio"
                    aria-checked={tint === key}
                    aria-label={DEPARTMENT_TINTS[key].label}
                    title={DEPARTMENT_TINTS[key].label}
                    disabled={saving}
                    onClick={() => setTint(key)}
                    style={tintStyle(key)}
                    className={cn(
                      "h-8 w-8 rounded-full bg-[linear-gradient(145deg,rgb(var(--tint)),rgb(var(--tint)/0.55))]",
                      "transition-[transform,box-shadow] duration-quick ease-spring hover:scale-110",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-base",
                      tint === key
                        ? "scale-110 ring-2 ring-[rgb(var(--tint))] ring-offset-2 ring-offset-base"
                        : "ring-1 ring-inset ring-line/[0.12]"
                    )}
                  />
                ))}
              </div>
            </div>

            <div className="space-y-2.5">
              <p className="text-[12px] text-ink-dim">On the chart</p>
              <DepartmentGlass tint={tint} className="px-4 py-3.5">
                <div className="flex items-start gap-3">
                  <DepartmentIcon icon={icon} />
                  <span className="min-w-0 pt-0.5">
                    <span className="block truncate text-[15px] font-medium tracking-tight text-ink-strong">
                      {name.trim() || "New department"}
                    </span>
                    {description.trim() && (
                      <span className="mt-0.5 block line-clamp-2 text-[11.5px] leading-snug text-ink-muted">{description.trim()}</span>
                    )}
                  </span>
                </div>
              </DepartmentGlass>
            </div>
          </div>

          <DialogFooter className={cn(DIALOG_FOOTER_CLASS, "gap-2")}>
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !name.trim()} isLoading={saving}>
              {department ? "Save" : "Create department"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
