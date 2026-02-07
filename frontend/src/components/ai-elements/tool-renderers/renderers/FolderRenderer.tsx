"use client";

import { Badge } from "@/components/ui/badge";
import {
  AlertTriangleIcon,
  FolderIcon,
  FolderOpenIcon,
  InboxIcon,
  SendIcon,
  Trash2Icon,
  ArchiveIcon,
  AlertCircleIcon,
} from "lucide-react";
import type { ToolRendererProps, FolderResult } from "../types";
import { EmptyState } from "../shared/EmptyState";
import { ResultSummary } from "../shared/ResultSummary";
import { RawJsonToggle } from "../shared/RawJsonToggle";
import type { LucideIcon } from "lucide-react";

const FOLDER_ICONS: Record<string, LucideIcon> = {
  inbox: InboxIcon,
  sent: SendIcon,
  trash: Trash2Icon,
  junk: AlertCircleIcon,
  spam: AlertCircleIcon,
  archive: ArchiveIcon,
  drafts: FolderOpenIcon,
};

function getFolderIcon(name: string): LucideIcon {
  const lower = name.toLowerCase();
  for (const [key, icon] of Object.entries(FOLDER_ICONS)) {
    if (lower.includes(key)) return icon;
  }
  return FolderIcon;
}

/**
 * Smart renderer for list_folders tool.
 * Shows folder tree with icons and unread/total counts.
 */
export function FolderRenderer({ output, errorText }: ToolRendererProps) {
  if (errorText) {
    return (
      <div className="p-3">
        <div className="flex items-start gap-2 text-destructive">
          <AlertTriangleIcon className="h-4 w-4 mt-0.5 shrink-0" />
          <p className="text-sm">{errorText}</p>
        </div>
      </div>
    );
  }

  if (!output) return null;

  const result = output as FolderResult;

  if (result.error) {
    return (
      <div className="p-3">
        <div className="flex items-start gap-2 text-destructive">
          <AlertTriangleIcon className="h-4 w-4 mt-0.5 shrink-0" />
          <p className="text-sm">{result.error}</p>
        </div>
      </div>
    );
  }

  if (!result.folders?.length) {
    return (
      <div className="p-3">
        <EmptyState icon={FolderIcon} title="No folders found" />
      </div>
    );
  }

  return (
    <div className="p-3 space-y-1">
      <ResultSummary count={result.count || result.folders.length} noun="folder" />

      <div className="space-y-0.5">
        {result.folders.map((folder) => {
          const Icon = getFolderIcon(folder.name);
          const indent = folder.level * 16;

          return (
            <div
              key={folder.id}
              className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/50 transition-colors"
              style={{ paddingLeft: `${8 + indent}px` }}
            >
              <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm flex-1 truncate">{folder.name}</span>

              {folder.unreadCount > 0 && (
                <Badge variant="default" className="text-[10px] px-1.5 py-0 min-w-[20px] justify-center">
                  {folder.unreadCount}
                </Badge>
              )}
              {folder.totalCount > 0 && folder.unreadCount === 0 && (
                <span className="text-[11px] text-muted-foreground">
                  {folder.totalCount}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <RawJsonToggle data={output} />
    </div>
  );
}
