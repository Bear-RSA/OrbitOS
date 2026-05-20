import Image from "next/image";
import { cn } from "@/lib/utils/classnames";

interface LogoProps {
  className?: string;
  size?: "sm" | "md" | "lg" | number;
}

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
        "rounded-xl bg-[#111111] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] relative overflow-hidden flex items-center justify-center transition-all duration-700",
        className
      )}
      style={{ width: pixelSize, height: pixelSize }}
    >
      <Image 
        src="/logo.png" 
        alt="OrbitOS Logo" 
        fill 
        className="object-cover rounded-[inherit]" 
        priority
      />
    </div>
  );
}
