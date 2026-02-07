"use client";

import { cn } from "@/lib/utils";
import { FileQuestion, type LucideIcon } from "lucide-react";
import type { ComponentProps } from "react";

interface EmptyStateProps extends ComponentProps<"div"> {
  icon?: LucideIcon;
  title: string;
  description?: string;
}

/**
 * Empty state - assistant-ui inspired.
 * Centered muted icon in circle, title, optional description.
 */
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
        "flex flex-col items-center justify-center py-8 px-4 text-center",
        className,
      )}
      {...props}
    >
      <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-muted">
        <Icon className="size-5 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && (
        <p className="mt-1.5 max-w-[240px] text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}
    </div>
  );
}
