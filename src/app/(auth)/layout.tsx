import type { Metadata } from "next";
import Image from "next/image";
import { Logo } from "@/components/brand/logo";


export const metadata: Metadata = {
  title: "Sign In",
  description: "Sign in to your OrbitOS workspace.",
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-base flex items-center justify-center p-6 selection:bg-primary/10">
      <div className="w-full max-w-sm shutter-reveal">
        {/* Logo */}
        <div className="flex flex-col items-center gap-4 mb-8 justify-center">
          <Logo 
            size="lg" 
            className="bg-surface-control shadow-[inset_0_1px_0_rgb(var(--ink-strong)_/_0.06),0_4px_20px_rgb(var(--scrim)_/_0.4)] border border-line/[0.04]" 
          />
          <div className="flex flex-col items-center gap-1.5">
            <span className="font-mono text-[10px] text-ink-dim uppercase tracking-[0.4em]">OrbitOS_Protocol</span>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
