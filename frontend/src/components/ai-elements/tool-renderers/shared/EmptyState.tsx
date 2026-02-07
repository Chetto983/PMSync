"use client";

import { cn } from "@/lib/utils";
import { FileQuestion, type LucideIcon } from "lucide-react";
import type { ComponentProps } from "react";

interface EmptyStateProps extends ComponentProps<"div"> {
  icon?: LucideIcon;
  title: string;
  description?: string;
}

export function EmptyState({
  icon: Icon = FileQuestion,
  title,
  description,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-6 px-4 text-center",
        className
      )}
      {...props}
    >
      <div className="w-10 h-10 rounded-full bg-primary/5 flex items-center justify-center mb-3">
        <Icon className="h-5 w-5 text-primary/40" />
      </div>
      <p className="text-sm font-medium text-foreground/70">{title}</p>
      {description && (
        <p className="text-xs text-muted-foreground mt-1 max-w-[220px]">
          {description}
        </p>
      )}
    </div>
  );
}
