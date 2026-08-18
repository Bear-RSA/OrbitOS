"use client";

import { cn } from "@/lib/utils/classnames";

interface DashboardShellProps {
  children: React.ReactNode;
  className?: string;
}

export function DashboardShell({ children, className }: DashboardShellProps) {
  return (
    <div className={cn("min-h-screen bg-background", className)}>
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 pb-24 sm:px-8 lg:px-10">
        {children}
      </div>
    </div>
  );
}
