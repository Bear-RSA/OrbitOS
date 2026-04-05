"use client";

import { cn } from "@/lib/utils/classnames";

interface DashboardShellProps {
  children: React.ReactNode;
  className?: string;
}

export function DashboardShell({ children, className }: DashboardShellProps) {
  return (
    <div className={cn("min-h-screen bg-background", className)}>
      <div className="max-w-6xl mx-auto px-6 py-8">
        {children}
      </div>
    </div>
  );
}
