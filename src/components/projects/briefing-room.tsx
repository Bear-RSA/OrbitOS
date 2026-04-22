"use client";

import { useState, useEffect, useRef } from "react";
import { UserAvatar } from "@/components/ui/user-avatar";
import { getMilestoneBriefings, Briefing } from "@/lib/queries/briefings";
import { sendBriefingAction } from "@/app/actions/briefings";
import { cn } from "@/lib/utils/classnames";
import { format } from "date-fns";
import { Command, X, Loader2, Send } from "lucide-react";

interface BriefingRoomProps {
  projectId: string;
  uid: string;
  isOpen: boolean;
  onClose: () => void;
}

export function BriefingRoom({ projectId, uid, isOpen, onClose }: BriefingRoomProps) {
  const [briefings, setBriefings] = useState<Briefing[]>([]);
  const [content, setContent] = useState("");
  const [isSending, setIsSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const unsub = getMilestoneBriefings(projectId, "global", (data: Briefing[]) => {
      setBriefings(data);
      setTimeout(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    });
    return () => unsub();
  }, [projectId, isOpen]);

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!content.trim() || isSending) return;

    setIsSending(true);
    const result = await sendBriefingAction({
      projectId,
      milestoneId: "global",
      uid,
      content: content.trim(),
    });
    
    if (result.success) {
      setContent("");
    } else {
      console.error(result.error);
    }
    setIsSending(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm lg:hidden transition-opacity"
          onClick={onClose}
        />
      )}

      <div 
        className={cn(
          "fixed top-0 right-0 h-[100dvh] w-full max-w-md bg-[#000000] border-l border-[#1a1a1a] z-50 flex flex-col transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]",
          isOpen ? "translate-x-0" : "translate-x-full"
        )}
      >
        <div className="h-16 border-b border-[#1a1a1a] flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-3">
             <div className="w-8 h-8 rounded bg-[#111111] flex items-center justify-center border border-[#1a1a1a]">
               <Command className="w-4 h-4 text-[#888888]" />
             </div>
             <div className="flex flex-col">
               <span className="text-[10px] font-mono text-[#555555] uppercase tracking-widest">Comm Link</span>
               <h3 className="text-[13px] font-medium text-[#ededed]">Briefing Room</h3>
             </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 -mr-2 text-[#666666] hover:text-[#ededed] transition-colors focus:outline-none rounded-md hover:bg-[#111111]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {briefings.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-3 opacity-50">
              <Command className="w-6 h-6 text-[#444444]" />
              <p className="text-[11px] font-mono text-[#666666] uppercase tracking-widest">No Active Briefings</p>
            </div>
          ) : (
            briefings.map((briefing, i) => {
              const isCurrentUser = briefing.author.uid === uid;
              return (
                <div key={briefing.id} className={cn("flex flex-col gap-1.5 animate-fade-in")} style={{ animationDelay: `${i * 30}ms` }}>
                  <div className="flex items-center gap-2">
                    <UserAvatar name={briefing.author.name} photoURL={briefing.author.photoURL} size="sm" />
                    <span className="text-[12px] font-mono text-[#888888]">{briefing.author.name}</span>
                    <span className="text-[10px] font-mono text-[#444444]">
                       {briefing.timestamp ? format(briefing.timestamp.toDate(), "HH:mm:ss") : "..."}
                    </span>
                  </div>
                  <div className={cn(
                    "text-[13px] font-mono text-[#ededed] leading-relaxed p-3 rounded-lg border break-words",
                    isCurrentUser ? "bg-[#111111] border-[#222222] ml-6" : "bg-[#050505] border-[#1a1a1a] mr-6"
                  )}>
                    {briefing.content}
                  </div>
                </div>
              );
            })
          )}
          <div ref={bottomRef} className="h-1" />
        </div>

        <div className="p-4 border-t border-[#1a1a1a] bg-[#000000] shrink-0">
          <form onSubmit={handleSend} className="relative flex items-center">
             <div className="absolute left-4 flex flex-col items-center justify-center text-[#555555]">
               <span className="text-[12px] font-mono">~$</span>
             </div>
             <input 
               type="text"
               value={content}
               onChange={(e) => setContent(e.target.value)}
               onKeyDown={handleKeyDown}
               placeholder="Transmit system briefing..."
               className="w-full bg-[#0A0A0A] border border-[#1a1a1a] rounded-lg pl-12 pr-12 py-3 text-[13px] font-mono text-[#ededed] placeholder:text-[#444444] focus:outline-none focus:border-[#333333] transition-colors"
               autoComplete="off"
               disabled={isSending}
             />
             <button
               type="submit"
               disabled={!content.trim() || isSending}
               className="absolute right-2 p-2 bg-transparent text-[#666666] hover:text-[#ededed] disabled:opacity-50 transition-colors focus:outline-none"
             >
               {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
             </button>
          </form>
        </div>
      </div>
    </>
  );
}
