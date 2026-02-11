"use client";

import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export interface ActionBarAction {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  variant?: "default" | "destructive";
}

interface ActionBarProps {
  actions: ActionBarAction[];
  className?: string;
}

/**
 * Floating action bar for per-item artifact actions.
 * Renders a compact row of icon buttons with title-based tooltips.
 */
export function ActionBar({ actions, className }: ActionBarProps) {
  if (actions.length === 0) return null;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md border bg-background/95 backdrop-blur-sm shadow-sm p-0.5",
        className,
      )}
    >
      {actions.map((action) => (
        <button
          key={action.label}
          type="button"
          title={action.label}
          onClick={(e) => {
            e.stopPropagation();
            action.onClick();
          }}
          className={cn(
            "inline-flex items-center justify-center rounded-sm p-1 transition-colors",
            action.variant === "destructive"
              ? "text-destructive hover:bg-destructive/10"
              : "text-muted-foreground hover:text-foreground hover:bg-accent",
          )}
        >
          <action.icon className="h-3.5 w-3.5" />
        </button>
      ))}
    </div>
  );
}
