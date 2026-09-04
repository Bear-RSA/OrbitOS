"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { EmojiGrid } from "@/components/messages/emoji-picker";
import { cn } from "@/lib/utils/classnames";
import type { MessageAttachment } from "@/types/message";

/* ------------------------------------------------------------------ */
/*  Media picker                                                       */
/*                                                                     */
/*  One popover over the composer, three tabs: emoji, GIFs, stickers.  */
/*                                                                     */
/*  Emoji INSERT into the draft — they are punctuation, and a message  */
/*  is usually words plus one. A GIF or sticker SENDS on click, which  */
/*  is the convention everywhere and the right one: nobody picks a GIF */
/*  and then goes looking for the send button.                         */
/*                                                                     */
/*  Search goes through `/api/gifs`, never straight to the provider —  */
/*  the key is server-side, and an endpoint of our own is also where   */
/*  the rate guard lives.                                              */
/* ------------------------------------------------------------------ */

type Tab = "emoji" | "gif" | "sticker";

const TABS: { id: Tab; label: string }[] = [
  { id: "emoji", label: "Emoji" },
  { id: "gif", label: "GIFs" },
  { id: "sticker", label: "Stickers" },
];

/** Long enough that typing a phrase is one request, not eight. */
const SEARCH_DEBOUNCE_MS = 350;

interface MediaPickerProps {
  onInsertEmoji: (emoji: string) => void;
  onSendAttachment: (attachment: MessageAttachment) => void;
  onClose: () => void;
}

export function MediaPicker({
  onInsertEmoji,
  onSendAttachment,
  onClose,
}: MediaPickerProps) {
  const [tab, setTab] = useState<Tab>("emoji");
  const containerRef = useRef<HTMLDivElement | null>(null);

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

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-label="Emoji, GIFs and stickers"
      className="absolute bottom-[calc(100%+0.5rem)] left-0 z-50 flex h-[22rem] w-[21rem] flex-col overflow-hidden rounded-xl border border-line/[0.06] bg-surface-card shadow-overlay ring-1 ring-line/5"
    >
      <div role="tablist" className="flex shrink-0 gap-1 border-b border-line/[0.04] p-1.5">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            role="tab"
            type="button"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cn(
              "flex-1 rounded-lg py-1.5 font-mono text-[9px] uppercase tracking-[0.18em] transition-colors",
              tab === id
                ? "bg-surface-control text-ink"
                : "text-ink-dim hover:bg-surface-hover hover:text-ink-muted"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "emoji" ? (
        <EmojiGrid onSelect={onInsertEmoji} />
      ) : (
        <MediaGrid kind={tab} onPick={onSendAttachment} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function MediaGrid({
  kind,
  onPick,
}: {
  kind: "gif" | "sticker";
  onPick: (attachment: MessageAttachment) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MessageAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (term: string, signal: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/gifs?kind=${kind}&q=${encodeURIComponent(term)}`,
          { signal }
        );
        const body = await response.json();

        if (!response.ok) {
          setError(body?.error ?? "Could not load results.");
          setResults([]);
          return;
        }
        setResults(Array.isArray(body.results) ? body.results : []);
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return;
        setError("Could not reach the GIF library.");
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    [kind]
  );

  /* Debounced, and the previous request is aborted — otherwise a fast
     typist races eight responses and the grid settles on whichever
     happened to land last. */
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => void run(query, controller.signal), SEARCH_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, run]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 p-2">
        <div className="flex items-center gap-2 rounded-lg bg-surface-control px-2.5 py-2 ring-1 ring-inset ring-line/[0.05] focus-within:ring-line/[0.14]">
          <Search className="h-3 w-3 shrink-0 text-ink-faint" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={kind === "gif" ? "Search GIFs" : "Search stickers"}
            aria-label={kind === "gif" ? "Search GIFs" : "Search stickers"}
            className="min-w-0 flex-1 bg-transparent text-[12px] text-ink placeholder:text-ink-faint focus-visible:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="shrink-0 text-ink-faint transition-colors hover:text-ink"
            >
              <X className="h-3 w-3" aria-hidden />
            </button>
          )}
        </div>
      </div>

      <div className="custom-scrollbar flex-1 overflow-y-auto px-2 pb-2">
        {error ? (
          <p className="px-2 py-10 text-center text-[12px] leading-relaxed text-ink-dim">
            {error}
          </p>
        ) : loading ? (
          /* Skeleton tiles rather than a spinner — the grid keeps its
             shape, so results do not shove the layout when they land. */
          <div className="columns-2 gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="mb-2 h-24 w-full animate-pulse rounded-lg bg-surface-control"
              />
            ))}
          </div>
        ) : results.length === 0 ? (
          <p className="px-2 py-10 text-center text-[12px] text-ink-dim">
            Nothing found
          </p>
        ) : (
          /* A masonry column layout, because these arrive at every
             aspect ratio and a fixed grid would letterbox most of them. */
          <div className="columns-2 gap-2">
            {results.map((item) => (
              <button
                key={`${item.providerId}-${item.previewUrl}`}
                type="button"
                onClick={() => onPick(item)}
                title={item.alt}
                className="mb-2 block w-full overflow-hidden rounded-lg bg-surface-control ring-1 ring-line/[0.05] transition-transform duration-150 hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              >
                {/* Deliberately not next/image: the optimizer re-encodes,
                    and a re-encoded GIF is a still picture. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.previewUrl}
                  alt={item.alt}
                  width={item.width}
                  height={item.height}
                  loading="lazy"
                  className="h-auto w-full"
                />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* GIPHY's terms require the attribution mark, and it is honest
          anyway — these results are somebody else's catalogue. */}
      <p className="shrink-0 border-t border-line/[0.04] px-3 py-1.5 text-center font-mono text-[8px] uppercase tracking-[0.2em] text-ink-faint">
        Powered by GIPHY
      </p>
    </div>
  );
}
