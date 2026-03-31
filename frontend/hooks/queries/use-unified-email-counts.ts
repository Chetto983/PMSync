/**
 * Unified email count hook
 *
 * Single source of truth for email unread counts across the app.
 * Both dashboard widgets and sidebar consume this hook so counts never diverge.
 *
 * Data source: GET /folders → folder.unreadCount (same as sidebar).
 * Applies displayMapping (e.g., CATEGORY_PERSONAL → INBOX) for consistent aggregation.
 *
 * @see DASH-C2 — Dashboard counts must match sidebar counts
 */

import { useMemo } from 'react';
import { useFolders } from './use-folders';
import { useFolderMetadata } from './use-folder-metadata';
import type { FoldersResponse } from '@/lib/api/folders';
import type { SpecialFolder } from '@/stores/email-ui-store';

// Folders where an unread badge is semantically meaningless.
const NO_BADGE_FOLDERS = new Set([
  'TRASH', 'SENT', 'DRAFTS', 'ARCHIVE', 'ALL',
  'STARRED', 'FLAGGED', 'CHAT', 'UNREAD',
]);

export interface UnifiedEmailCounts {
  /** Per-folder unread counts (mapped via displayMapping) */
  folderCounts: Partial<Record<SpecialFolder, number>>;
  /** Total INBOX unread count — the primary dashboard badge number */
  inboxUnread: number;
  /** Whether the underlying folder query is still loading */
  isLoading: boolean;
}

/**
 * Compute folder counts from raw folder data + metadata.
 * Extracted so both the hook and external callers (useFolderManagement)
 * can use identical logic.
 */
export function computeFolderCounts(
  foldersData: FoldersResponse | undefined,
  displayMapping: Record<string, string> | undefined,
): Partial<Record<SpecialFolder, number>> {
  const counts: Partial<Record<SpecialFolder, number>> = {};

  if (foldersData?.foldersByProvider) {
    Object.values(foldersData.foldersByProvider).forEach((folders) => {
      folders.forEach((folder) => {
        if (folder.specialUse) {
          const rawSpecialUse = folder.specialUse.toUpperCase();
          if (NO_BADGE_FOLDERS.has(rawSpecialUse)) return;
          const displayAs = displayMapping?.[rawSpecialUse] || rawSpecialUse;
          const specialUse = displayAs as SpecialFolder;
          counts[specialUse] = (counts[specialUse] || 0) + (folder.unreadCount || 0);
        }
      });
    });
  }

  return counts;
}

/**
 * Unified email counts hook.
 *
 * Uses folder data as the single source of truth for unread counts.
 * If `foldersData` is provided (e.g., from a parent that already called useFolders),
 * it uses that data directly. Otherwise it calls useFolders() internally.
 *
 * @param foldersData - Optional pre-fetched folder data to avoid duplicate queries
 */
export function useUnifiedEmailCounts(foldersData?: FoldersResponse): UnifiedEmailCounts {
  const { data: fetchedFolders, isLoading: foldersLoading } = useFolders();
  const { data: metadata } = useFolderMetadata();

  const effectiveData = foldersData ?? fetchedFolders;

  const folderCounts = useMemo(
    () => computeFolderCounts(effectiveData, metadata?.displayMapping),
    [effectiveData, metadata],
  );

  const inboxUnread = folderCounts.INBOX ?? 0;

  return {
    folderCounts,
    inboxUnread,
    isLoading: !foldersData && foldersLoading,
  };
}
