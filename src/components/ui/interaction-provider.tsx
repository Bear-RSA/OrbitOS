"use client";

import * as React from "react";
import { usePathname, useSearchParams } from "next/navigation";

export function InteractionProvider({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = React.useState(false);
  const [lastInteractedId, setLastInteractedId] = React.useState<string | null>(null);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const idleTimer = React.useRef<NodeJS.Timeout | null>(null);

  const resetIdle = React.useCallback(() => {
    document.documentElement.style.setProperty("--idle-opacity", "1");
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => {
      document.documentElement.style.setProperty("--idle-opacity", "0.4");
    }, 3000);
  }, []);

  React.useEffect(() => {
    setMounted(true);
    resetIdle();
    
    const handleMouseMove = (e: MouseEvent) => {
      if (window.matchMedia("(pointer: coarse)").matches) return;
      resetIdle();
      
      const x = (e.clientX / window.innerWidth) * 100;
      const y = (e.clientY / window.innerHeight) * 100;
      
      document.documentElement.style.setProperty("--mouse-x", `${x.toFixed(2)}%`);
      document.documentElement.style.setProperty("--mouse-y", `${y.toFixed(2)}%`);
    };

    const handlePointerDown = (e: PointerEvent) => {
      resetIdle();
      const target = e.target as HTMLElement;
      const interactiveEl = target.closest("button, a, input, textarea, .focus-item");
      if (interactiveEl) {
        const id = interactiveEl.getAttribute("data-interaction-id") || Math.random().toString(36).substr(2, 9);
        interactiveEl.setAttribute("data-interaction-id", id);
        setLastInteractedId(id);
      }
    };

    // Edge Case: Window Blur/Resize Interrupts
    const handleReset = () => {
      document.documentElement.style.setProperty("--mouse-x", "50%");
      document.documentElement.style.setProperty("--mouse-y", "50%");
      // Reset magnetic offsets on all cards to prevent drifts
      document.querySelectorAll(".focus-item").forEach((el) => {
        (el as HTMLElement).style.setProperty("--magnetic-x", "0px");
        (el as HTMLElement).style.setProperty("--magnetic-y", "0px");
      });
    };

    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("blur", handleReset);
    window.addEventListener("resize", handleReset);
    
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("blur", handleReset);
      window.removeEventListener("resize", handleReset);
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [resetIdle]);

  // Route Transition Continuity
  React.useEffect(() => {
    document.documentElement.style.setProperty("--page-transition-opacity", "0");
    const timer = setTimeout(() => {
      document.documentElement.style.setProperty("--page-transition-opacity", "1");
    }, 50); // Soft crossfade trigger
    return () => clearTimeout(timer);
  }, [pathname, searchParams]);

  if (!mounted) return <>{children}</>;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        [data-interaction-id="${lastInteractedId}"] {
          animation: interaction-memory-fade 1.2s cubic-bezier(0.4, 0, 0.2, 1) forwards;
        }
        @keyframes interaction-memory-fade {
          0% { filter: brightness(1.08) saturate(1.05); }
          100% { filter: brightness(1) saturate(1); }
        }
      `}} />
      {children}
    </>
  );
}
