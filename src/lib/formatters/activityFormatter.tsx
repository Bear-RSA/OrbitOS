import React from "react";
import { SSEActivityEvent } from "../../hooks/use-activity-stream";


export function formatActivity(activity: SSEActivityEvent, user?: { name?: string }) {
  // Gracefully handle both SSE ISO strings and legacy Firestore timestamps
  const ts = activity.timestamp
    ? typeof activity.timestamp === "string"
      ? new Date(activity.timestamp)
      : new Date((activity.timestamp as any).seconds * 1000)
    : new Date();

  const time = ts.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const nameValue = user?.name || activity.actor?.name || "Someone";
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

  const Actor = () => <Highlight colorClass="text-white" glowColor="rgba(255,255,255,0.4)">{nameValue}</Highlight>;
  const Time = () => <Highlight className="ml-1" colorClass="text-[#78B8FF]" glowColor="rgba(120, 184, 255, 0.5)">{time}</Highlight>;
  const Target = ({ val }: { val?: string }) => <Highlight className="mx-1" colorClass="text-[#E5B567]" glowColor="rgba(229, 181, 103, 0.4)">{val || "unknown"}</Highlight>;



  switch (type) {
    case "ASSET_INGESTED":
      return (
        <>
          <Actor /> has uploaded a file in Project Files, asset name <Target val={m.fileName} /> at <Time />
        </>
      );

    case "ASSET_DESTROYED":
    case "ASSET_DELETED":
      return (
        <>
          <Actor /> has deleted a file from Project Files, asset name <Target val={m.fileName} /> at <Time />
        </>
      );

    case "MILESTONE_COMPLETE":
    case "MILESTONE_EXECUTED":
      return (
        <>
          <Actor /> has completed the milestone <Target val={m.milestone || m.taskTitle} /> at <Time />
        </>
      );

    case "DIRECTIVE_CREATED":
    case "MILESTONE_CREATED":
      return (
        <>
          <Actor /> has created a new milestone <Target val={m.taskTitle || m.directiveId} /> at <Time />
        </>
      );

    case "DIRECTIVE_DELETED":
      return (
        <>
          <Actor /> has purged directive <Target val={m.taskTitle} /> from the system at <Time />
        </>
      );

    case "DIRECTIVE_TRANSITION":
      return (
        <>
          <Actor /> has moved <Target val={m.taskTitle || m.directiveId} /> from <Highlight className="mx-1 opacity-70 italic">{m.from || "unknown"}</Highlight> to <Highlight className="mx-1 opacity-70 italic">{m.to || "unknown"}</Highlight> at <Time />
        </>
      );

    case "DIRECTIVE_UPDATED":
      return (
        <>
          <Actor /> has updated <Target val={m.taskTitle || m.directiveId} />, changing <Highlight className="mx-1">{m.field}</Highlight> from <Highlight className="mx-1 opacity-70">{m.oldValue}</Highlight> to <Highlight className="mx-1 opacity-70">{m.newValue}</Highlight> at <Time />
        </>
      );

    case "INVITE_DISPATCHED":
    case "MEMBER_ADDED":
      return (
        <>
          <Actor /> has added <Target val={m.email || m.memberName || "a member"} /> to the project at <Time />
        </>
      );

    case "MEMBER_REMOVED":
      return (
        <>
          <Actor /> has removed <Target val={m.memberName || "a member"} /> from the project at <Time />
        </>
      );

    default:
      return (
        <>
          <Actor /> performed an action in the system at <Time />
        </>
      );
  }
}

