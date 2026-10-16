"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Settings } from "lucide-react";

import { cn } from "@/lib/utils/classnames";

/* ------------------------------------------------------------------ */
/*  Settings Link                                                      */
/*                                                                     */
/*  The gear beside the avatar, on every page. Always one round icon:  */
/*  on /settings its stroke thickens, the way the nav marks the        */
/*  current page, but it never grows a label or changes size.          */
/* ------------------------------------------------------------------ */

export function SettingsLink({ className }: { className?: string }) {
  const pathname = usePathname();
  const active = pathname === "/settings" || pathname.startsWith("/settings/");

  return (
    <Link
      href="/settings"
      aria-label="Settings"
      title="Settings"
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
        "transition-[color,background-color,transform] duration-quick ease-spring",
        "active:scale-[0.96] active:duration-press active:ease-press [-webkit-tap-highlight-color:transparent]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-base",
        active ? "text-ink-strong" : "text-ink-muted hover:bg-surface-control/50 hover:text-ink",
        className
      )}
    >
      {/* CSS `stroke-width` outranks Lucide's attribute and animates, as in the nav. */}
      <Settings
        className={cn(
          "h-4 w-4 transition-[stroke-width] duration-quick ease-spring",
          active ? "[stroke-width:2.6]" : "[stroke-width:1.75]"
        )}
        aria-hidden
      />
    </Link>
  );
}
