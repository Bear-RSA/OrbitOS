import { Loader } from "@/components/ui/loader";

export default function Loading() {
  return (
    <div className="min-h-[100dvh] w-full bg-[#050505] flex flex-col items-center justify-center gap-6 animate-in fade-in duration-1000">
      {/* Using standard OrbitOS global config */}
      <Loader />
      
      <div className="flex flex-col items-center gap-2">
        <span className="font-mono text-[10px] tracking-[0.3em] uppercase text-[#555555]">
          System Rendering
        </span>
        <div className="w-24 h-px bg-gradient-to-r from-transparent via-[#111111] to-transparent"></div>
      </div>
    </div>
  );
}
