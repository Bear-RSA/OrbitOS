import type { Metadata } from "next";
import Image from "next/image";

export const metadata: Metadata = {
  title: "Sign In",
  description: "Sign in to your OrbitOS workspace.",
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3 mb-12 justify-center">
          <div className="w-10 h-10 rounded-xl bg-[#111111] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] relative overflow-hidden flex items-center justify-center">
            <Image src="/logo.png" alt="OrbitOS Logo" fill className="object-cover" />
          </div>
          <span className="font-semibold text-[#ededed] text-lg tracking-tight">OrbitOS</span>
        </div>
        {children}
      </div>
    </div>
  );
}
