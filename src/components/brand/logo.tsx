import { OrbitMark } from "@/components/brand/orbit-mark";
import { cn } from "@/lib/utils/classnames";

interface LogoProps {
  className?: string;
  size?: "sm" | "md" | "lg" | number;
}

/**
 * The app icon: the orbit mark on a tile. Both are drawn from theme tokens
 * (ink on surface-control), so the icon flips with the theme instead of
 * staying a white-on-black PNG on a paper page.
 */
export function Logo({ className, size = "md" }: LogoProps) {
  const sizeMap = {
    sm: 24, // w-6 h-6
    md: 40, // w-10 h-10
    lg: 48, // w-12 h-12
  };

  const pixelSize = typeof size === "number" ? size : sizeMap[size];

  return (
    <div
      className={cn(
        "rounded-xl bg-surface-control shadow-card relative overflow-hidden flex items-center justify-center transition-all duration-700",
        className
      )}
      style={{ width: pixelSize, height: pixelSize }}
    >
      <OrbitMark className="h-[64%] w-[64%] text-ink-strong" />
    </div>
  );
}
