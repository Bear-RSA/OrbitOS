import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from "lucide-react";

import { DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils/classnames";

/* ------------------------------------------------------------------ */
/*  Dialog parts                                                       */
/*                                                                     */
/*  The pieces every modal repeats, so they all read as one family:    */
/*  an icon tile beside the title, tinted notices, and a footer that   */
/*  sits under a hairline. Tone carries meaning, never decoration —    */
/*  red is for loss, amber for "this needs a decision", green for done.*/
/* ------------------------------------------------------------------ */

export type DialogTone = "neutral" | "red" | "amber" | "green";

const TILE_TONE: Record<DialogTone, string> = {
  neutral: "bg-surface-control text-ink ring-line/[0.08]",
  red: "bg-orbit-red/10 text-orbit-red ring-orbit-red/20",
  amber: "bg-orbit-amber/10 text-orbit-amber ring-orbit-amber/20",
  green: "bg-orbit-green/10 text-orbit-green ring-orbit-green/20",
};

const NOTICE_TONE: Record<DialogTone, string> = {
  neutral: "bg-surface-raised/60 text-ink-muted ring-line/[0.06]",
  red: "bg-orbit-red/[0.07] text-orbit-red ring-orbit-red/15",
  amber: "bg-orbit-amber/[0.07] text-orbit-amber ring-orbit-amber/15",
  green: "bg-orbit-green/[0.07] text-orbit-green ring-orbit-green/15",
};

const NOTICE_ICON: Record<DialogTone, LucideIcon> = {
  neutral: Info,
  red: AlertCircle,
  amber: AlertTriangle,
  green: CheckCircle2,
};

/** A rounded tile holding the dialog's icon. */
export function DialogIconTile({
  icon: Icon,
  tone = "neutral",
  className,
}: {
  icon: LucideIcon;
  tone?: DialogTone;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "grid h-11 w-11 shrink-0 place-items-center rounded-2xl ring-1 ring-inset",
        "shadow-[inset_0_1px_0_rgb(var(--sheen)_/_calc(0.06*var(--sheen-a)))]",
        TILE_TONE[tone],
        className
      )}
    >
      <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
    </div>
  );
}

/** Icon tile, title and description, laid out the same in every dialog. */
export function DialogHeading({
  icon,
  tone = "neutral",
  title,
  description,
  leading,
}: {
  icon?: LucideIcon;
  tone?: DialogTone;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Replaces the icon tile, e.g. with an avatar. */
  leading?: React.ReactNode;
}) {
  return (
    <DialogHeader className="mb-7 flex-row items-start gap-4 space-y-0">
      {leading ?? (icon && <DialogIconTile icon={icon} tone={tone} />)}
      {/* Right padding keeps a long title clear of the close button. */}
      <div className="min-w-0 flex-1 space-y-1.5 pr-8 pt-0.5">
        <DialogTitle className="text-[18px] font-medium leading-snug tracking-tight text-ink-strong">
          {title}
        </DialogTitle>
        {description && (
          <DialogDescription className="text-[13px] font-light leading-relaxed text-ink-muted">
            {description}
          </DialogDescription>
        )}
      </div>
    </DialogHeader>
  );
}

/** A tinted strip for results and warnings inside a dialog. */
export function DialogNotice({
  tone = "neutral",
  icon,
  children,
  className,
}: {
  tone?: DialogTone;
  icon?: LucideIcon;
  children: React.ReactNode;
  className?: string;
}) {
  const Icon = icon ?? NOTICE_ICON[tone];
  return (
    <div
      role={tone === "red" ? "alert" : undefined}
      className={cn("flex items-start gap-3 rounded-xl px-4 py-3 ring-1 ring-inset", NOTICE_TONE[tone], className)}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0 text-[13px] leading-relaxed">{children}</div>
    </div>
  );
}

/** The footer rule: a hairline, then the actions on the right. */
export const DIALOG_FOOTER_CLASS = "mt-8 border-t border-line/[0.06] pt-6";
