"use client";

import * as React from "react";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils/classnames";
import { Loader } from "@/components/ui/loader";

/* ------------------------------------------------------------------ */
/*  Settings Primitives                                                */
/*                                                                     */
/*  Every control on the settings page is one of a few shapes: a       */
/*  labelled row with a switch, with a segmented choice, or with a     */
/*  button. Keeping them here stops the section files from each        */
/*  inventing their own row metrics.                                   */
/* ------------------------------------------------------------------ */

/** Text column shared by every row: title plus a supporting line. */
function RowLabel({
  title,
  description,
  htmlFor,
}: {
  title: string;
  description?: string;
  htmlFor?: string;
}) {
  return (
    <div className="min-w-0 flex-1">
      <label
        htmlFor={htmlFor}
        className={cn(
          "block text-[14px] font-medium leading-none tracking-tight text-ink",
          htmlFor && "cursor-pointer"
        )}
      >
        {title}
      </label>
      {description && (
        <p className="mt-2 max-w-md text-[13px] font-light leading-relaxed text-ink-muted">
          {description}
        </p>
      )}
    </div>
  );
}

/** Divider-separated stack. Rows never carry their own borders. */
export function SettingsList({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col divide-y divide-white/[0.05]", className)}>
      {children}
    </div>
  );
}

export function SettingsRow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 py-5 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:gap-8",
        className
      )}
    >
      {children}
    </div>
  );
}

/**
 * Boolean preference.
 *
 * The switch renders stored state only — never an optimistic guess. A write
 * that fails must not leave the control claiming something the server does
 * not agree with.
 */
export function ToggleRow({
  id,
  title,
  description,
  checked,
  onChange,
  disabled = false,
  busy = false,
}: {
  id: string;
  title: string;
  description?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  busy?: boolean;
}) {
  return (
    <SettingsRow>
      <RowLabel title={title} description={description} htmlFor={id} />
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={title}
        disabled={disabled || busy}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 items-center self-start rounded-full sm:self-auto",
          "ring-1 ring-inset transition-colors duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[#050505]",
          "disabled:cursor-not-allowed disabled:opacity-45",
          checked
            ? "bg-ink/90 ring-white/20"
            : "bg-white/[0.06] ring-white/[0.08] hover:bg-white/[0.1]"
        )}
      >
        <span
          className={cn(
            "flex h-4 w-4 items-center justify-center rounded-full transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
            checked ? "translate-x-6 bg-[#050505]" : "translate-x-1 bg-ink-muted"
          )}
        >
          {busy && <Loader size={10} stroke={2} color={checked ? "#EDEDED" : "#050505"} />}
        </span>
      </button>
    </SettingsRow>
  );
}

/** Small set of mutually exclusive choices — cheaper to read than a select. */
export function SegmentedRow<T extends string>({
  title,
  description,
  value,
  options,
  onChange,
  disabled = false,
}: {
  title: string;
  description?: string;
  value: T;
  options: { value: T; label: string; icon?: LucideIcon }[];
  onChange: (next: T) => void;
  disabled?: boolean;
}) {
  return (
    <SettingsRow>
      <RowLabel title={title} description={description} />
      <div
        role="radiogroup"
        aria-label={title}
        className="flex shrink-0 flex-wrap gap-1 rounded-xl bg-white/[0.035] p-1 ring-1 ring-inset ring-white/[0.06]"
      >
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => onChange(option.value)}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg px-3 py-2",
                "font-mono text-[10px] uppercase tracking-[0.14em]",
                "transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25",
                "disabled:cursor-not-allowed disabled:opacity-45",
                active
                  ? "bg-white/[0.1] text-ink ring-1 ring-inset ring-white/[0.1]"
                  : "text-ink-dim hover:text-ink-muted"
              )}
            >
              {option.icon && <option.icon className="h-3 w-3" aria-hidden />}
              {option.label}
            </button>
          );
        })}
      </div>
    </SettingsRow>
  );
}

/** Read-only pair — system facts the user can see but not edit. */
export function ReadonlyRow({
  title,
  description,
  value,
  action,
}: {
  title: string;
  description?: string;
  value?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <SettingsRow>
      <RowLabel title={title} description={description} />
      <div className="flex min-w-0 shrink-0 items-center gap-3">
        {value !== undefined && (
          <span className="truncate font-mono text-[12px] text-ink-muted">{value}</span>
        )}
        {action}
      </div>
    </SettingsRow>
  );
}

/** Inline feedback strip used under forms. */
export function FormNotice({
  tone,
  children,
}: {
  tone: "error" | "success";
  children: React.ReactNode;
}) {
  if (!children) return null;
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "mt-4 text-[12px] font-light leading-relaxed",
        tone === "error" ? "text-orbit-red" : "text-orbit-green"
      )}
    >
      {children}
    </p>
  );
}

/** The one input treatment used by every settings form field. */
export const SETTINGS_FIELD_CLASS =
  "w-full rounded-xl bg-white/[0.035] px-4 text-[14px] font-light text-ink ring-1 ring-inset ring-white/[0.06] " +
  "placeholder:text-ink-dim transition-[background-color,box-shadow] duration-300 " +
  "hover:bg-white/[0.05] focus:bg-white/[0.05] focus:outline-none focus:ring-white/25 " +
  "disabled:cursor-not-allowed disabled:opacity-50";

/** Confirm button — matches the profile page save affordance. */
export function SettingsButton({
  children,
  onClick,
  disabled,
  busy,
  icon: Icon,
  variant = "default",
  type = "button",
  className,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  busy?: boolean;
  icon?: LucideIcon;
  variant?: "default" | "quiet" | "danger";
  type?: "button" | "submit";
  className?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || busy}
      className={cn(
        "inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl px-4",
        "transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25 focus-visible:ring-offset-2 focus-visible:ring-offset-[#050505]",
        "disabled:cursor-not-allowed disabled:opacity-40",
        variant === "default" && "bg-ink text-[#050505] hover:bg-white",
        variant === "quiet" &&
          "bg-white/[0.06] text-ink ring-1 ring-inset ring-white/[0.08] hover:bg-white/[0.1]",
        variant === "danger" &&
          "bg-orbit-red/[0.08] text-orbit-red ring-1 ring-inset ring-orbit-red/25 hover:bg-orbit-red/[0.16]",
        className
      )}
    >
      <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
        {busy ? (
          <Loader
            size={14}
            stroke={2.5}
            color={variant === "default" ? "#050505" : "#EDEDED"}
          />
        ) : (
          Icon && <Icon className="h-3.5 w-3.5" aria-hidden />
        )}
      </span>
      <span className="whitespace-nowrap font-mono text-[10px] font-medium uppercase tracking-[0.18em]">
        {children}
      </span>
    </button>
  );
}
