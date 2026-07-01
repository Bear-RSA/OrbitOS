import React from "react";
import { SSEActivityEvent } from "../../hooks/use-activity-stream";


export function formatActivity(activity: SSEActivityEvent, _user?: { name?: string }) {
  const m = activity.metadata || {};
  const type = activity.eventType;

  // Reusable highlight components for the "glow" effect
  const Highlight = ({ children, className = "", colorClass = "text-white", glowColor = "rgba(255,255,255,0.3)" }: { children: React.ReactNode, className?: string, colorClass?: string, glowColor?: string }) => (
    <span 
      className={`font-bold ${colorClass} ${className}`}
      style={{ textShadow: `0 0 10px ${glowColor}` }}
    >
      {children}
    </span>
  );

  const Target = ({ val }: { val?: string }) => <Highlight className="mx-1" colorClass="text-[#E5B567]" glowColor="rgba(229, 181, 103, 0.4)">{val || "unknown"}</Highlight>;

  switch (type) {
    case "ASSET_INGESTED":
      return (
        <>
          ingested asset <Target val={m.fileName} />
        </>
      );

    case "ASSET_DESTROYED":
    case "ASSET_DELETED":
      return (
        <>
          purged asset <Target val={m.fileName} />
        </>
      );

    case "MILESTONE_COMPLETE":
    case "MILESTONE_EXECUTED":
      return (
        <>
          executed milestone <Target val={m.milestone || m.taskTitle} />
        </>
      );

    case "DIRECTIVE_CREATED":
    case "MILESTONE_CREATED":
      return (
        <>
          initialized directive <Target val={m.taskTitle || m.directiveId} />
        </>
      );

    case "DIRECTIVE_DELETED":
      return (
        <>
          terminated directive <Target val={m.taskTitle} />
        </>
      );

    case "DIRECTIVE_TRANSITION":
      return (
        <>
          shifted <Target val={m.taskTitle || m.directiveId} /> to <Highlight className="mx-1 opacity-70 italic">{m.to || "unknown"}</Highlight>
        </>
      );

    case "DIRECTIVE_UPDATED":
      return (
        <>
          reconfigured <Highlight className="mx-1">{m.field}</Highlight> on <Target val={m.taskTitle || m.directiveId} />
        </>
      );

    case "INVITE_DISPATCHED":
    case "MEMBER_ADDED":
      return (
        <>
          provisioned access for <Target val={m.email || m.memberName} />
        </>
      );

    case "MEMBER_REMOVED":
      return (
        <>
          revoked access for <Target val={m.memberName} />
        </>
      );

    default:
      return (
        <>
          executed system operation
        </>
      );
  }
}

