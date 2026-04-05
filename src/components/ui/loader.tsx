"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils/classnames";


declare global {
  namespace JSX {
    interface IntrinsicElements {
      "l-hatch": {
        size?: string | number;
        color?: string | number;
        speed?: string | number;
        stroke?: string | number;
      };
    }
  }
}

interface LoaderProps {
  size?: number;
  color?: string;
  stroke?: number;
  speed?: number;
  className?: string;
}

export function Loader({
  size = 21,
  color = "#ffffff", // Standard White
  stroke = 4.5,
  speed = 3.5,
  className
}: LoaderProps) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    async function initLoader() {
      const { hatch } = await import("ldrs");
      hatch.register();
      setIsMounted(true);
    }
    initLoader();
  }, []);

  if (!isMounted) {
    return (
      <div
        className={cn("inline-flex items-center justify-center opacity-0", className)}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <div className={cn("inline-flex items-center justify-center animate-in fade-in duration-500", className)}>
      <l-hatch
        size={size.toString()}
        stroke={stroke.toString()}
        color={color}
        speed={speed.toString()}
      ></l-hatch>
    </div>
  );
}
