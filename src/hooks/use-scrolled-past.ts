"use client";

import { useEffect, useState, type RefObject } from "react";

/**
 * True once the sentinel element has scrolled above the viewport, which
 * for a sticky bar means content is now passing underneath it. An
 * IntersectionObserver, not a scroll listener — nothing runs per frame.
 */
export function useScrolledPast(sentinel: RefObject<Element | null>): boolean {
  const [past, setPast] = useState(false);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setPast(!entry.isIntersecting && entry.boundingClientRect.top < 0),
      { threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [sentinel]);

  return past;
}
