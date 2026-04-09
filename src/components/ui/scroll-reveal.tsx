"use client";

import { useEffect, useRef, useState, ReactNode } from "react";
import { cn } from "@/lib/utils/classnames";

interface ScrollRevealProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  yOffset?: number;
  duration?: number;
  once?: boolean;
}

export function ScrollReveal({
  children,
  className,
  delay = 0,
  yOffset = 40,
  duration = 700,
  once = true,
}: ScrollRevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    let observer: IntersectionObserver;

    // A small timeout ensures that Next.js route transitions and layout shifts
    // are completed before we calculate intersections, fixing the "blank on first load" bug.
    const timeoutId = setTimeout(() => {
      observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              setIsVisible(true);
              if (once) {
                observer.disconnect();
              }
            } else if (!once) {
              setIsVisible(false);
            }
          });
        },
        {
          root: null,
          rootMargin: "0px 0px -10px 0px", // Reduced margin to ensure earlier triggering
          threshold: 0,
        }
      );

      observer.observe(element);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      if (observer) {
        observer.disconnect();
      }
    };
  }, [once]);

  return (
    <div
      ref={ref}
      className={cn(
        "transition-all ease-[cubic-bezier(0.16,1,0.3,1)] will-change-[opacity,transform,filter]",
        isVisible ? "opacity-100 translate-y-0 blur-0" : "opacity-0 blur-[4px]",
        className
      )}
      style={{
        transitionDuration: `${duration}ms`,
        transitionDelay: `${delay}ms`,
        transform: isVisible ? "translateY(0)" : `translateY(${yOffset}px)`,
      }}
    >
      {children}
    </div>
  );
}
