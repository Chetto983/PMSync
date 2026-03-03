/**
 * Tool UI for list_folders.
 * Tree-like list with folder name, unread count badge, total count.
 */
import { makeAssistantToolUI } from '@assistant-ui/react';
import { Folder, AlertCircle } from 'lucide-react';
import type { FolderResult, FolderItem } from '../types';

function FolderRow({ folder }: { folder: FolderItem }) {
  return (
    <div
      className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-muted/30 transition-colors"
      style={{ paddingLeft: `${8 + folder.level * 16}px` }}
    >
      <Folder className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <span className="text-sm flex-1 truncate">{folder.name}</span>
      {folder.unreadCount > 0 && (
        <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded-full bg-[hsl(var(--color-info)/0.1)] text-[hsl(var(--color-info))]">
          {folder.unreadCount}
        </span>
      )}
      <span className="text-xs text-muted-foreground">{folder.totalCount}</span>
    </div>
  );
}

export const FolderToolUI = makeAssistantToolUI<
  Record<string, never>,
  FolderResult
>({
  toolName: 'list_folders',
  render: ({ result, status }) => {
    if (status.type === 'running') {
      return (
        <div className="chat-tool-running-inline">
          <Folder className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Loading folders...</span>
        </div>
      );
    }
    if (status.type === 'incomplete') {
      return (
        <div className="flex items-center gap-2 p-3 rounded-lg border border-destructive/30 bg-destructive/5">
          <AlertCircle className="h-4 w-4 text-destructive" />
          <span className="text-sm text-destructive">
            Failed to load folders: {'reason' in status ? status.reason : 'unknown'}
          </span>
        </div>
      );
    }
    if (!result) return null;
    if (result.error) {
      return (
        <div className="flex items-center gap-2 p-3 rounded-lg border border-destructive/30 bg-destructive/5">
          <AlertCircle className="h-4 w-4 text-destructive" />
          <span className="text-sm text-destructive">{result.error}</span>
        </div>
      );
    }
    const folders = result.folders ?? [];
    return (
      <div className="chat-tool-card">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Folders
          </span>
          <span className="text-xs text-muted-foreground">{result.count} folder{result.count !== 1 ? 's' : ''}</span>
        </div>
        {folders.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">No folders found.</p>
        ) : (
          <div className="divide-y divide-border/50">
            {folders.map((f) => (
              <FolderRow key={f.id} folder={f} />
            ))}
          </div>
        )}
      </div>
    );
  },
});

