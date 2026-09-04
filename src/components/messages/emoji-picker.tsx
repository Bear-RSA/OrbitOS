"use client";

import { useEffect, useRef, useState } from "react";
import { EMOJI_GROUPS } from "@/lib/messages/emoji";
import { cn } from "@/lib/utils/classnames";

/* ------------------------------------------------------------------ */
/*  Emoji picker                                                       */
/*                                                                     */
/*  Characters, not images — the reader's own platform draws them, so  */
/*  there is no sprite sheet to download and nothing to keep current.  */
/*                                                                     */
/*  The recents row is the whole point of a picker like this. People   */
/*  reach for the same six or seven all day, and a grid that always    */
/*  starts at 😀 makes them hunt for 👍 every time. It is per-device,  */
/*  in localStorage, because it is a convenience and not a fact about  */
/*  the account.                                                       */
/* ------------------------------------------------------------------ */

const RECENT_KEY = "orbitos.messages.recentEmoji";
const RECENT_MAX = 16;

function readRecent(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((e) => typeof e === "string") : [];
  } catch {
    return [];
  }
}

function writeRecent(list: string[]): void {
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    /* A private window simply never remembers. Not worth a broken send. */
  }
}

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

export function EmojiPicker({ onSelect, onClose }: EmojiPickerProps) {
  const [recent, setRecent] = useState<string[]>([]);
  const [group, setGroup] = useState(EMOJI_GROUPS[0].name);
  const containerRef = useRef<HTMLDivElement | null>(null);

  /* After mount — the server has no localStorage, and reading it during
     render would mismatch hydration. */
  useEffect(() => {
    setRecent(readRecent());
  }, []);

  /* Click-away and Escape, bound only while open. */
  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  const choose = (emoji: string) => {
    const next = [emoji, ...recent.filter((e) => e !== emoji)].slice(0, RECENT_MAX);
    setRecent(next);
    writeRecent(next);
    onSelect(emoji);
  };

  const active = EMOJI_GROUPS.find((g) => g.name === group) ?? EMOJI_GROUPS[0];

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-label="Choose an emoji"
      className="absolute bottom-[calc(100%+0.5rem)] left-0 z-50 w-[19rem] overflow-hidden rounded-xl border border-line/[0.06] bg-surface-card shadow-overlay ring-1 ring-line/5"
    >
      {recent.length > 0 && (
        <div className="border-b border-line/[0.04] p-2">
          <h3 className="px-1 pb-1.5 font-mono text-[9px] uppercase tracking-[0.2em] text-ink-faint">
            Recent
          </h3>
          <div className="flex flex-wrap">
            {recent.map((emoji) => (
              <EmojiButton key={`recent-${emoji}`} emoji={emoji} onClick={choose} />
            ))}
          </div>
        </div>
      )}

      <div className="custom-scrollbar h-48 overflow-y-auto p-2">
        <div className="flex flex-wrap">
          {active.emoji.map((emoji) => (
            <EmojiButton key={emoji} emoji={emoji} onClick={choose} />
          ))}
        </div>
      </div>

      {/* Group switcher. One emoji per group rather than a word — the
          labels would wrap at this width, and the glyph is the label. */}
      <div className="custom-scrollbar flex gap-0.5 overflow-x-auto border-t border-line/[0.04] p-1.5">
        {EMOJI_GROUPS.map((g) => (
          <button
            key={g.name}
            type="button"
            onClick={() => setGroup(g.name)}
            title={g.name}
            aria-label={g.name}
            aria-pressed={g.name === group}
            className={cn(
              "shrink-0 rounded-lg px-2 py-1 text-[15px] leading-none transition-colors",
              g.name === group ? "bg-surface-control" : "hover:bg-surface-hover"
            )}
          >
            {g.emoji[0]}
          </button>
        ))}
      </div>
    </div>
  );
}

function EmojiButton({
  emoji,
  onClick,
}: {
  emoji: string;
  onClick: (emoji: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onClick(emoji)}
      aria-label={emoji}
      className="flex h-8 w-8 items-center justify-center rounded-lg text-[18px] leading-none transition-transform duration-150 hover:scale-125 hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
    >
      {emoji}
    </button>
  );
}
