"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, FolderKanban, Users, MessageSquare, Settings, LucideIcon } from "lucide-react";
import { useUnreadMessages } from "@/hooks/use-unread-messages";
import { cn } from "@/lib/utils/classnames";

/* ------------------------------------------------------------------ */
/*  Global Navigation                                                  */
/*                                                                     */
/*  Until this existed there was no nav anywhere in the app. Every     */
/*  page hand-rolled a back button to /dashboard, and /teams was       */
/*  reachable only through Settings -> Workspace, which meant the      */
/*  roster was effectively hidden from anyone who had not gone looking */
/*  for it in the settings tree.                                       */
/* ------------------------------------------------------------------ */

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Owner-only destinations are filtered out for members. */
  ownerOnly?: boolean;
}

const ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutGrid },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/teams", label: "Teams", icon: Users },
  { href: "/messages", label: "Messages", icon: MessageSquare },
  { href: "/settings", label: "Settings", icon: Settings },
];

interface AppNavProps {
  uid?: string;
  orgId?: string;
  className?: string;
}

export function AppNav({ uid, orgId, className }: AppNavProps) {
  const pathname = usePathname();
  const unread = useUnreadMessages(uid, orgId);
  const hasUnread = unread.length > 0;

  return (
    <nav aria-label="Primary" className={cn("min-w-0", className)}>
      {/* Scrolls rather than wraps on a narrow viewport — a nav that
          reflows to two rows changes the header height on every route. */}
      <ul className="flex items-center gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {ITEMS.map((item) => {
          const Icon = item.icon;
          // Exact match for /dashboard, prefix match elsewhere so a
          // project detail route still lights up Projects.
          const active =
            item.href === "/dashboard"
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
          const showBadge = item.href === "/messages" && hasUnread;

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group/nav inline-flex h-9 items-center gap-2 rounded-lg px-2.5 sm:px-3",
                  "transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-base",
                  active
                    ? "bg-surface-control text-ink ring-1 ring-inset ring-line/[0.08]"
                    : "text-ink-dim hover:bg-surface-control/60 hover:text-ink-muted"
                )}
              >
                <span className="relative flex shrink-0 items-center justify-center">
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                  {showBadge && (
                    <span className="absolute -right-1.5 -top-1.5 h-2 w-2 rounded-full bg-orbit-red ring-2 ring-base" />
                  )}
                </span>
                {/* The label is the accessible name on every viewport; it
                    is only visually hidden on small screens. */}
                <span className="sr-only sm:not-sr-only font-mono text-[10px] uppercase tracking-[0.16em] whitespace-nowrap">
                  {item.label}
                </span>
                {showBadge && <span className="sr-only">Unread messages</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
