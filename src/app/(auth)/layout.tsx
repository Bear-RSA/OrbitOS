import type { Metadata } from "next";
import Image from "next/image";

export const metadata: Metadata = {
  title: "Sign In",
  description: "Sign in to your OrbitOS workspace.",
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 selection:bg-primary/20">
      <div className="w-full max-w-sm shutter-reveal">
        {/* Logo */}
        <div className="flex flex-col items-center gap-4 mb-16 justify-center">
          <div className="w-12 h-12 rounded-xl bg-surface-low shadow-[0_4px_20px_rgba(0,0,0,0.4)] relative overflow-hidden flex items-center justify-center transition-all duration-700 hover:bg-surface-container">
            <Image src="/logo.png" alt="OrbitOS Logo" fill className="object-cover opacity-60 hover:opacity-100 transition-opacity" />
          </div>
          <span className="font-mono text-[10px] text-on-surface-variant uppercase tracking-[0.4em]">Operational Node_Auth</span>
        </div>
        {children}
      </div>
    </div>
  );
}
