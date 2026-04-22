"use client";

import { useState, useEffect, useRef } from "react";
import { UserAvatar } from "@/components/ui/user-avatar";
import { getMilestoneBriefings, Briefing } from "@/lib/queries/briefings";
import { sendBriefingAction } from "@/app/actions/briefings";
import { cn } from "@/lib/utils/classnames";
import { format } from "date-fns";
import { Command, Loader2, Send } from "lucide-react";

interface MilestoneBriefingTerminalProps {
  projectId: string;
  milestoneId: string;
  uid: string;
}

export function MilestoneBriefingTerminal({ projectId, milestoneId, uid }: MilestoneBriefingTerminalProps) {
  const [briefings, setBriefings] = useState<Briefing[]>([]);
  const [content, setContent] = useState("");
  const [isSending, setIsSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsub = getMilestoneBriefings(projectId, milestoneId, (data) => {
      setBriefings(data);
      setTimeout(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    });
    return () => unsub();
  }, [projectId, milestoneId]);

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!content.trim() || isSending) return;

    setIsSending(true);
    const result = await sendBriefingAction({
      projectId,
      milestoneId,
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
    <div className="bg-[#000000] border border-[#1a1a1a] rounded-lg mt-2 mb-4 overflow-hidden flex flex-col mx-3">
      {/* Terminal Header */}
      <div className="h-8 border-b border-[#1a1a1a] flex items-center px-4 bg-[#050505]">
        <Command className="w-3.5 h-3.5 text-[#555] mr-2" />
        <span className="text-[10px] font-mono text-[#555555] uppercase tracking-widest">
          SYS.TERMINAL // MILESTONE: {milestoneId}
        </span>
      </div>

      {/* Feed (max-h restricted for table viewing) */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 max-h-[300px]">
        {briefings.length === 0 ? (
           <div className="py-4 text-center">
             <span className="text-[10px] font-mono text-[#444] uppercase tracking-widest">Awaiting Transmissions...</span>
           </div>
        ) : (
          briefings.map((briefing, i) => {
            const isMe = briefing.author.uid === uid;
            return (
              <div key={briefing.id} className={cn("flex flex-col gap-1 w-full")}>
                 <div className="flex items-center gap-2">
                   <UserAvatar name={briefing.author.name} photoURL={briefing.author.photoURL} size="sm" />
                   <span className="text-[11px] font-mono text-[#888888]">{briefing.author.name}</span>
                   <span className="text-[9px] font-mono text-[#444444]">
                     {briefing.timestamp ? format(briefing.timestamp.toDate(), "HH:mm:ss") : "..."}
                   </span>
                 </div>
                 <div className={cn(
                   "text-[12px] font-mono text-[#ededed] leading-relaxed break-words",
                   isMe ? "ml-6 text-[#ccc]" : "ml-6"
                 )}>
                   {briefing.content}
                 </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} className="h-1" />
      </div>

      {/* Input */}
      <div className="border-t border-[#1a1a1a] p-2 bg-[#050505]">
        <form onSubmit={handleSend} className="relative flex items-center">
           <div className="absolute left-3 text-[#555555]">
             <span className="text-[11px] font-mono">~$</span>
           </div>
           <input 
             type="text"
             value={content}
             onChange={(e) => setContent(e.target.value)}
             onKeyDown={handleKeyDown}
             placeholder="Transmit briefing..."
             className="w-full bg-transparent border-0 pl-8 pr-10 py-1.5 text-[11px] font-mono text-[#ededed] placeholder:text-[#444444] focus:outline-none focus:ring-0"
             autoComplete="off"
             disabled={isSending}
           />
           <button
             type="submit"
             disabled={!content.trim() || isSending}
             className="absolute right-2 text-[#555] hover:text-[#ededed] disabled:opacity-50 transition-colors focus:outline-none"
           >
             {isSending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
           </button>
        </form>
      </div>
    </div>
  );
}
