"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LayoutGrid, FolderKanban, CalendarDays, Users, MessageSquare, Ticket, Lock, Settings, LucideIcon } from "lucide-react";
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
/*                                                                     */
/*  The current page is marked by its icon alone: a heavier stroke and */
/*  full-strength ink, eased in, with no box behind it.                */
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
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/teams", label: "Teams", icon: Users },
  { href: "/messages", label: "Messages", icon: MessageSquare },
  { href: "/tickets", label: "Tickets", icon: Ticket },
  /* Sits after the day-to-day destinations and before Settings: the
     Vault is something you go to on purpose, not somewhere you live. */
  { href: "/vault", label: "Vault", icon: Lock },
  { href: "/settings", label: "Settings", icon: Settings },
];

interface AppNavProps {
  uid?: string;
  orgId?: string;
  className?: string;
  /**
   * Destinations to leave out on this page â€” a page does not need to
   * advertise itself, and Settings is reachable from the profile menu.
   */
  hide?: string[];
}

function isActive(href: string, pathname: string): boolean {
  // Exact match for /dashboard, prefix match elsewhere so a project
  // detail route still lights up Projects.
  return href === "/dashboard" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

export function AppNav({ uid, orgId, className, hide }: AppNavProps) {
  const pathname = usePathname();
  const unread = useUnreadMessages(uid, orgId);
  const hasUnread = unread.length > 0;
  const items = hide?.length ? ITEMS.filter((item) => !hide.includes(item.href)) : ITEMS;

  const listRef = useRef<HTMLUListElement>(null);
  // Which edges have destinations scrolled out of view, for the edge fades.
  const [edges, setEdges] = useState({ start: false, end: false });

  /* Icons only; the name shows in a tooltip under the hovered icon.
     Nothing in the row moves, which an inline label that pushed its
     neighbours aside did. One tooltip is shared: the first appears after a
     short delay, and while it is up, moving to the next icon glides it
     across rather than fading one out and another in. It is portalled
     because the glass bar clips anything that hangs below it. */
  const [tip, setTip] = useState<{ label: string; x: number; y: number; glide: boolean } | null>(null);
  const [tipVisible, setTipVisible] = useState(false);
  const tipVisibleRef = useRef(false);
  const showTimer = useRef<number>(0);
  const hideTimer = useRef<number>(0);

  const hideTip = useCallback(() => {
    window.clearTimeout(showTimer.current);
    window.clearTimeout(hideTimer.current);
    tipVisibleRef.current = false;
    setTipVisible(false);
  }, []);

  const showTip = useCallback((label: string, target: HTMLElement) => {
    window.clearTimeout(showTimer.current);
    window.clearTimeout(hideTimer.current);
    const rect = target.getBoundingClientRect();
    const place = (glide: boolean) => {
      setTip({ label, x: rect.left + rect.width / 2, y: rect.bottom + 10, glide });
      tipVisibleRef.current = true;
      setTipVisible(true);
    };
    if (tipVisibleRef.current) place(true);
    else showTimer.current = window.setTimeout(() => place(false), 250);
  }, []);

  // A short grace period, so crossing the gap between icons keeps it up.
  const leaveTip = useCallback(() => {
    window.clearTimeout(showTimer.current);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(hideTip, 120);
  }, [hideTip]);

  // The bar hides on scroll and routes change under the pointer.
  useEffect(() => {
    hideTip();
    window.addEventListener("scroll", hideTip, { passive: true });
    return () => {
      window.removeEventListener("scroll", hideTip);
      window.clearTimeout(showTimer.current);
      window.clearTimeout(hideTimer.current);
    };
  }, [pathname, hideTip]);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;

    const readEdges = () => {
      const max = list.scrollWidth - list.clientWidth;
      setEdges({ start: list.scrollLeft > 1, end: list.scrollLeft < max - 1 });
    };

    /* On a phone the row is wider than the space it gets. Bring the current
       page into view rather than leaving it scrolled off an edge. */
    const active = list.querySelector<HTMLElement>('[aria-current="page"]');
    if (active && list.scrollWidth > list.clientWidth) {
      const left = active.offsetLeft;
      const right = left + active.offsetWidth;
      if (left < list.scrollLeft || right > list.scrollLeft + list.clientWidth) {
        list.scrollLeft = left - (list.clientWidth - active.offsetWidth) / 2;
      }
    }

    readEdges();
    const observer = new ResizeObserver(readEdges);
    observer.observe(list);
    list.addEventListener("scroll", readEdges, { passive: true });
    return () => {
      observer.disconnect();
      list.removeEventListener("scroll", readEdges);
    };
  }, [pathname, items.length]);

  return (
    <nav aria-label="Primary" className={cn("min-w-0", className)}>
      {/* Scrolls rather than wraps on a narrow viewport â€” a nav that
          reflows to two rows changes the header height on every route. */}
      <ul
        ref={listRef}
        /* `safe center`, not `center`: a centred row wider than its box
           overflows on both sides, and the left half cannot be scrolled
           to â€” on a phone it slid under the logo. Safe centring falls back to the start edge.
           The fades say there is more to scroll to on that side. */
        className={cn(
          "relative flex items-center [justify-content:safe_center] gap-0.5 sm:gap-1.5 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          edges.start && edges.end
            ? "[mask-image:linear-gradient(to_right,transparent,black_20px,black_calc(100%-20px),transparent)]"
            : edges.end
              ? "[mask-image:linear-gradient(to_right,black_calc(100%-20px),transparent)]"
              : edges.start && "[mask-image:linear-gradient(to_right,transparent,black_20px)]"
        )}
      >
        {items.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href, pathname);
          const showBadge = item.href === "/messages" && hasUnread;

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                onPointerEnter={(event) => {
                  if (event.pointerType === "mouse") showTip(item.label, event.currentTarget);
                }}
                onPointerLeave={leaveTip}
                onPointerDown={hideTip}
                onFocus={(event) => {
                  if (event.currentTarget.matches(":focus-visible")) showTip(item.label, event.currentTarget);
                }}
                onBlur={leaveTip}
                className={cn(
                  "group/nav relative inline-flex h-9 min-w-9 items-center justify-center rounded-full px-4",
                  "transition-[color,background-color,transform] duration-quick ease-spring",
                  "active:scale-[0.96] active:duration-press active:ease-press [-webkit-tap-highlight-color:transparent]",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-base",
                  active ? "font-semibold text-ink-strong" : "text-ink-muted hover:bg-surface-control/50 hover:text-ink"
                )}
              >
                <span className="relative flex shrink-0 items-center justify-center">
                  {/* CSS `stroke-width` outranks Lucide's attribute and, unlike
                      it, animates â€” so the icon thickens rather than snaps. */}
                  <Icon
                    className={cn(
                      "h-4 w-4 transition-[stroke-width] duration-quick ease-spring",
                      active ? "[stroke-width:2.6]" : "[stroke-width:1.75]"
                    )}
                    aria-hidden
                  />
                  {showBadge && (
                    <span className="absolute -right-1.5 -top-1.5 h-2 w-2 rounded-full bg-orbit-red ring-2 ring-base" />
                  )}
                </span>
                {/* Icons only, on every screen. The label is the accessible
                    name; the heavier stroke says which page you're on. */}
                <span className="sr-only">{item.label}</span>
                {showBadge && <span className="sr-only">Unread messages</span>}
              </Link>
            </li>
          );
        })}
      </ul>
      {tip &&
        createPortal(
          <div
            aria-hidden
            className={cn(
              "pointer-events-none fixed left-0 top-0 z-50 whitespace-nowrap rounded-full bg-ink-strong px-2.5 py-1 text-[12px] font-medium tracking-normal text-on-ink shadow-raised",
              "transition-opacity duration-quick ease-spring",
              tip.glide && "[transition-property:opacity,transform]",
              tipVisible ? "opacity-100" : "opacity-0"
            )}
            style={{ transform: `translate3d(${tip.x}px, ${tip.y}px, 0) translateX(-50%)` }}
          >
            {tip.label}
          </div>,
          document.body
        )}
    </nav>
  );
}
