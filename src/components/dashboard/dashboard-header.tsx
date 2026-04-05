"use client";

import { format } from "date-fns";
import { Member } from "@/types/member";

interface DashboardHeaderProps {
  currentUser: Member;
  orgName: string;
}

export function DashboardHeader({ currentUser, orgName }: DashboardHeaderProps) {
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const ownerMessage = `${greeting}, ${currentUser.name.split(" ")[0]}. Here's what needs your attention.`;
  const memberMessage = `Let's make progress today.`;

  return (
    <div className="animate-fade-in group">
      <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[#666666] mb-4">
        {orgName}
      </p>
      <h1 className="text-3xl font-light text-[#ededed] tracking-tight">
        {currentUser.role === "owner" ? ownerMessage : memberMessage}
      </h1>
      <p className="text-sm text-[#888888] mt-3 font-light">
        {format(new Date(), "EEEE, d MMMM yyyy")}
      </p>
    </div>
  );
}
