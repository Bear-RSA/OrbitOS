"use client";

import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/auth-context";
import { useActivityStream, SSEActivityEvent } from "@/hooks/use-activity-stream";
import { formatActivity } from "@/lib/formatters/activityFormatter";



import { cn } from "@/lib/utils/classnames";
import { format } from "date-fns";
import {
  Terminal,
  Send,
  Zap,
  Upload,
  Trash2,
  UserPlus,
  Radio,
  ArrowUp
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Event visual config                                                */
/* ------------------------------------------------------------------ */

const EVENT_CONFIG: Record<
  string,
  { icon: any; color: string; label: string }
> = {
  SYSTEM_BOOT:          { icon: Terminal,  color: "#85C89B", label: "SYS" },
  INVITE_DISPATCHED:    { icon: Send,      color: "#78B8FF", label: "INV" },
  DIRECTIVE_TRANSITION: { icon: Zap,       color: "#ededed", label: "DIR" },
  DIRECTIVE_CREATED:    { icon: Zap,       color: "#ededed", label: "DIR" },
  DIRECTIVE_ASSIGNED:   { icon: UserPlus,  color: "#FFD278", label: "ASN" },
  MILESTONE_COMPLETE:   { icon: Zap,       color: "#85C89B", label: "MLS" },
  PROJECT_TERMINATED:   { icon: Trash2,    color: "#E57A7A", label: "END" },
  ASSET_INGESTED:       { icon: Upload,    color: "#78FFD2", label: "AST" },
  ASSET_DESTROYED:      { icon: Trash2,    color: "#E57A7A", label: "DEL" },
  STATUS_TRANSITION:    { icon: Radio,     color: "#ededed", label: "STA" },
  BRIEFING_POSTED:      { icon: Radio,     color: "#ededed", label: "MSG" },
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface CommandCenterProps {
  projectId: string;
}

export function CommandCenter({ projectId }: CommandCenterProps) {
  const { events: rawEvents, loading, connected } = useActivityStream({ projectId });
  
  // Twitch-style Chat States
  const [displayEvents, setDisplayEvents] = useState<SSEActivityEvent[]>([]);
  const [queue, setQueue] = useState<SSEActivityEvent[]>([]);
  const [isScrolledToTop, setIsScrolledToTop] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  const feedRef = useRef<HTMLDivElement>(null);
  const processedRef = useRef<Set<string>>(new Set());
  const batchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isInitialLoad = useRef(true);

  const MAX_DOM_EVENTS = 100;

  // 1. Detect new events & populate buffer queue
  useEffect(() => {
    if (!rawEvents || rawEvents.length === 0) return;

    if (isInitialLoad.current) {
      const ids = new Set<string>();
      let initial = [...rawEvents];
      
      // Virtual boundary: Prevent monumental lag on first load
      if (initial.length > MAX_DOM_EVENTS) {
        initial = initial.slice(initial.length - MAX_DOM_EVENTS);
      }
      
      initial.forEach(e => ids.add(e.id));
      processedRef.current = ids;
      setDisplayEvents(initial);
      isInitialLoad.current = false;
      
      // Auto-jump to top initially
      requestAnimationFrame(() => scrollToTop(false));
      return;
    }

    const newEvents = rawEvents.filter(e => !processedRef.current.has(e.id));
    if (newEvents.length > 0) {
      newEvents.forEach(e => processedRef.current.add(e.id));
      setQueue(prev => [...prev, ...newEvents]);
    }
  }, [rawEvents]);

  // 2. ~100ms Batching Algorithm
  useEffect(() => {
    if (queue.length === 0) return;

    if (!batchTimeoutRef.current) {
      batchTimeoutRef.current = setTimeout(() => {
        setDisplayEvents(prev => {
          let next = [...prev, ...queue];
          // DOM Recycling: Only trim history if we are live to prevent scroll-yanking
          if (isScrolledToTop && next.length > MAX_DOM_EVENTS) {
            next = next.slice(next.length - MAX_DOM_EVENTS);
          }
          return next;
        });

        if (!isScrolledToTop) {
          setUnreadCount(prev => prev + queue.length);
        }

        setQueue([]);
        batchTimeoutRef.current = null;
      }, 100);
    }

    return () => {
      if (batchTimeoutRef.current) {
        clearTimeout(batchTimeoutRef.current);
        batchTimeoutRef.current = null;
      }
    };
  }, [queue, isScrolledToTop]);

  // 3. Follow Scroll Animation
  useEffect(() => {
    if (isScrolledToTop && displayEvents.length > 0 && !isInitialLoad.current) {
       // Wait for React DOM flush
       requestAnimationFrame(() => {
           // If browser anchored the scroll down to respect older elements, 
           // gracefully push it back up to absolute 0 seamlessly
           if (feedRef.current && feedRef.current.scrollTop > 0) {
               feedRef.current.scrollTo({
                   top: 0,
                   behavior: "smooth"
               });
           }
       });
    }
  }, [displayEvents.length, isScrolledToTop]);

  // 4. Manual Scroll Intelligence
  const handleScroll = () => {
    if (!feedRef.current) return;
    const { scrollTop } = feedRef.current;
    
    // Sub-pixel threshold of 10px acts as boundary
    const isAtTop = scrollTop < 10;
    
    setIsScrolledToTop(isAtTop);

    // If returning back to top, instantly read queued unread notifications
    if (isAtTop && unreadCount > 0) {
      setUnreadCount(0);
      
      // Re-trigger history culling if we paused and expanded memory footprint
      setDisplayEvents(prev => {
        if (prev.length > MAX_DOM_EVENTS) return prev.slice(prev.length - MAX_DOM_EVENTS);
        return prev;
      });
    }
  };

  const scrollToTop = (smooth = true) => {
    if (feedRef.current) {
      feedRef.current.scrollTo({
        top: 0,
        behavior: smooth ? "smooth" : "auto"
      });
      setIsScrolledToTop(true);
      setUnreadCount(0);
    }
  };

  // State-Driven Status Inference
  let systemStatusStr = "Nominal";
  let systemStatusColor = "#85C89B"; // Green
  let liveText = "Live";
  
  if (!connected) {
    systemStatusStr = "Degraded";
    systemStatusColor = "#E57A7A"; // Red
    liveText = "Reconnecting";
  } else if (!isScrolledToTop) {
    systemStatusStr = "Paused";
    systemStatusColor = "#FFB86C"; // Orange
    liveText = "Paused";
  }

  // Explicitly sort events so the newest timestamp is ALWAYS at index 0 (top)
  const sortedEvents = [...displayEvents].sort((a, b) => {
    const tA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const tB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    return tB - tA;
  });

  return (
    <div className="animate-fade-in mt-24">
      {/* Dynamic Twitch CSS Animations */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes stream-in {
          0% { opacity: 0; transform: translateY(-10px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .stream-event {
          animation: stream-in 200ms cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
          will-change: transform, opacity;
        }
        @keyframes pkt-flash {
          0% { color: #ededed; text-shadow: 0 0 10px rgba(255,255,255,0.3); }
          100% { color: #333333; text-shadow: none; }
        }
        .pkt-update {
          animation: pkt-flash 600ms ease-out forwards;
        }
      `}} />

      {/* ────────── HEADER ────────── */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-[10px] font-mono uppercase tracking-[0.3em] text-[#444444] mb-3 flex items-center gap-3">
            <span className="w-1.5 h-1.5 rounded-full bg-white/[0.04] ring-1 ring-white/[0.08]" />
            System Diagnostics
          </h2>
          <div className="flex items-center gap-4">
            <h3 className="text-2xl font-light text-[#ededed] tracking-tight">
              Command Center
            </h3>
            <span className="h-4 w-px bg-white/[0.06]" />
            {/* Live/Paused indicator */}
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-40" style={{ backgroundColor: systemStatusColor }} />
                <span className="relative inline-flex rounded-full h-2 w-2" style={{ backgroundColor: systemStatusColor }} />
              </span>
              <span className="text-[10px] font-mono uppercase tracking-[0.2em] transition-colors" style={{ color: systemStatusColor }}>
                {liveText}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Terminal className="w-3.5 h-3.5 text-[#333333]" />
          <span className="text-[10px] font-mono text-[#333333] uppercase tracking-wider">
            SSE Bridge
          </span>
        </div>
      </div>

      {/* ────────── FEED CONTAINER ────────── */}
      <div className="rounded-2xl border border-[#1a1a1a] bg-[#000000] overflow-hidden font-mono relative">
        {/* Feed header bar */}
        <div className="border-b border-[#1a1a1a] px-6 py-4 flex items-center justify-between bg-[#050505]">
          <div className="flex items-center gap-3">
            <Terminal className="w-3.5 h-3.5 text-[#444444]" />
            <span className="text-[9px] font-mono uppercase tracking-[0.25em] text-[#ededed]">
              TELEMETRY_LOG
            </span>
          </div>
          {/* Using a key that changes causes DOM remount which cleanly triggers our pkts flash CSS each update */}
          <span key={rawEvents.length} className="text-[10px] font-mono text-[#333333] tabular-nums pkt-update">
            {rawEvents.length} PKTS_RECEIVED
          </span>
        </div>
        
        {/* 'Chat Paused Due to Scroll' Banner */}
        {!isScrolledToTop && unreadCount > 0 && (
          <div className="absolute top-[60px] left-1/2 -translate-x-1/2 z-10 transition-all duration-300 stream-event group cursor-pointer" onClick={() => scrollToTop(true)}>
            <div className="px-4 py-1.5 rounded-full bg-[#050505]/95 border border-[#1a1a1a] shadow-[0_0_20px_rgba(0,0,0,0.8)] backdrop-blur-md flex items-center gap-2 hover:border-[#333333] transition-colors">
               <ArrowUp className="w-3 h-3 text-[#FFB86C] animate-bounce" />
               <span className="text-[10px] font-mono text-[#ededed] uppercase tracking-wider tabular-nums">
                  {unreadCount} New Update{unreadCount !== 1 ? 's' : ''}
               </span>
            </div>
          </div>
        )}

        <div className="relative group/scroll-mask">
          <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-[#000000] to-transparent z-20 pointer-events-none" />
          <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#000000] to-transparent z-20 pointer-events-none" />
          
          <div
            ref={feedRef}
            onScroll={handleScroll}
            className="max-h-[500px] overflow-y-auto custom-scrollbar p-6 space-y-4 relative"
          >
          {loading ? (
            <div className="space-y-4 opacity-20">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-4 bg-[#111111] rounded animate-pulse w-full" />
              ))}
            </div>
          ) : sortedEvents.length === 0 ? (
            <div className="py-20 flex flex-col items-center justify-center">
              <div className="w-12 h-12 bg-[#060606] rounded-2xl flex items-center justify-center ring-1 ring-[#1a1a1a] mb-5">
                <Terminal className="w-5 h-5 text-[#222222]" />
              </div>
              <p className="text-[12px] font-mono text-[#ededed] mb-1 uppercase tracking-widest">
                No signal detected
              </p>
            </div>
          ) : (
            <div className="space-y-3 pt-2">
              {sortedEvents.map((event) => {
                const config = EVENT_CONFIG[event.eventType] || EVENT_CONFIG.SYSTEM_BOOT;
                const ts = event.timestamp ? new Date(event.timestamp) : null;

                return (
                  <div
                    key={event.id}
                    className="stream-event flex flex-col gap-1 border-l border-[#111111] pl-4 py-1 hover:border-[#222222] transition-colors group relative overflow-hidden"
                  >
                    {/* Subtle micro-glow effect behind entry */}
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-[0.03] transition-opacity duration-300 pointer-events-none" style={{ backgroundColor: config.color }} />
                    
                    <div className="flex items-center justify-between text-[9px] text-[#444444] z-10">
                       <span>
                         [{ts ? format(ts, "yyyy-MM-dd HH:mm:ss") : "0000-00-00 00:00:00"}]
                       </span>
                       <span className="uppercase tracking-widest group-hover:text-[#666666] transition-colors">
                         {event.actor?.name || "SYS"}
                       </span>
                    </div>
                    <div className="text-[11px] leading-relaxed z-10">
                      <span style={{ color: config.color }} className="mr-2 uppercase font-bold tracking-tight drop-shadow-sm">
                        {config.label} //
                      </span>
                      <span className="text-[#888888] group-hover:text-[#aaaaaa] transition-colors">
                        {formatActivity(event, event.actor)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ────────── FOOTER ────────── */}
        <div className="border-t border-[#1a1a1a] px-6 py-4 flex items-center justify-between bg-[#050505]">
          <div className="flex items-center gap-3">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-40" style={{ backgroundColor: systemStatusColor }} />
              <span className="relative inline-flex rounded-full h-2 w-2" style={{ backgroundColor: systemStatusColor }} />
            </span>
            <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-[#555555]">
              System Status: <span style={{ color: systemStatusColor }} className="transition-colors duration-300">{systemStatusStr}</span>
            </span>
          </div>

          <span className="text-[10px] font-mono text-[#444444] tabular-nums tracking-widest">
            ORBIT_TELEMETRY_v4.0
          </span>
        </div>
      </div>
    </div>
  );
}
