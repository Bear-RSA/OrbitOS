import type { Metadata } from "next";
import Image from "next/image";
import { Logo } from "@/components/brand/logo";


export const metadata: Metadata = {
  title: "Sign In",
  description: "Sign in to your OrbitOS workspace.",
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center p-6 selection:bg-primary/10">
      <div className="w-full max-w-sm shutter-reveal">
        {/* Logo */}
        <div className="flex flex-col items-center gap-4 mb-8 justify-center">
          <Logo 
            size="lg" 
            className="bg-[#111111] shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_4px_20px_rgba(0,0,0,0.4)] border border-white/[0.04]" 
          />
          <div className="flex flex-col items-center gap-1.5">
            <span className="font-mono text-[10px] text-[#555555] uppercase tracking-[0.4em]">OrbitOS_Protocol</span>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
