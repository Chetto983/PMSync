import { useMemo, useCallback, useState } from 'react';
import { type EmailListParams, type Conversation, type Email as ApiEmail } from '@/lib/api/email';
import { getFolders, type Provider } from '@/lib/api/folders';
import { useEmailStats, useInfiniteConversations, useInfiniteEmails } from '@/hooks/queries';
import { useFoldersStore } from '@/stores/folders-store';
import { logger } from '@/lib/logger';
import type { Email } from '@/stores/email-store';
import type { FolderItem } from './use-folder-logic';
import type { AdvancedSearchFilters } from '@/components/email';

/**
 * Map API email to store email format
 * Handles field name differences between API and store
 */
export function mapApiEmailToStore(apiEmail: ApiEmail): Email {
  return {
    ...apiEmail,
    // Map isFlagged (API) to isImportant (store)
    isImportant: apiEmail.isFlagged || false,
    // Calculate hasAttachments from attachments array
    hasAttachments: apiEmail.attachments && apiEmail.attachments.length > 0,
  };
}

/**
 * Props for useMailboxData hook
 */
interface UseMailboxDataProps {
  activeFolder: FolderItem | null;
  advancedFilters: AdvancedSearchFilters;
  searchQuery?: string;
  forceConversationView: boolean | null;
}

/**
 * Centralized data fetching for Mailbox component
 * Uses TanStack Query for caching and pagination
 */
export function useMailboxData({
  activeFolder,
  advancedFilters,
  searchQuery,
  forceConversationView,
}: UseMailboxDataProps) {
  // Folder state from store
  const setFoldersData = useFoldersStore((state) => state.setFoldersData);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [foldersLoading, setFoldersLoading] = useState(false);

  // Email stats query
  const emailStatsQuery = useEmailStats();
  const emailStats = emailStatsQuery.data ?? null;

  // Determine label folder ID
  const labelFolderId = useMemo(() => {
    if (!activeFolder) return undefined;
    return activeFolder.id.startsWith('label:') ? activeFolder.id.replace('label:', '') : undefined;
  }, [activeFolder]);

  // Determine view mode: email list (flat) or conversation (threaded)
  const useEmailListView = useMemo(() => {
    // Labels always require email list view (server-side filtering)
    if (labelFolderId) return true;

    // No active folder means we show list view by default
    if (!activeFolder) return true;

    // Check if filters are active - filters require email list view
    const hasActiveFilters = Boolean(
      searchQuery ||
      advancedFilters.searchQuery ||
      advancedFilters.from ||
      advancedFilters.to ||
      advancedFilters.subject ||
      (advancedFilters.labelIds?.length ?? 0) > 0 ||
      advancedFilters.startDate ||
      advancedFilters.endDate ||
      advancedFilters.hasAttachments !== undefined ||
      advancedFilters.isRead != null ||
      advancedFilters.isStarred !== undefined ||
      activeFolder.queryOverrides?.isRead !== undefined ||
      activeFolder.queryOverrides?.isStarred !== undefined ||
      activeFolder.queryOverrides?.isImportant !== undefined ||
      activeFolder.queryOverrides?.hasAttachments !== undefined ||
      activeFolder.queryOverrides?.startDate !== undefined ||
      activeFolder.queryOverrides?.endDate !== undefined,
    );

    // Filters active = must use email list view
    if (hasActiveFilters) return true;

    // No filters - use user preference (default: conversation view = true)
    return forceConversationView === false;
  }, [activeFolder, advancedFilters, forceConversationView, labelFolderId, searchQuery]);

  // Computed state for UI
  const isConversationView = !useEmailListView;

  // Build email list params
  const emailListParams = useMemo<Omit<EmailListParams, 'page'>>(() => {
    if (!activeFolder) {
      return { limit: 50 };
    }

    if (labelFolderId) {
      return {
        limit: 50,
        search: advancedFilters.searchQuery || searchQuery || undefined,
        from: advancedFilters.from || undefined,
        to: advancedFilters.to || undefined,
        subject: advancedFilters.subject || undefined,
        labelIds: [labelFolderId, ...(advancedFilters.labelIds || [])],
        startDate: advancedFilters.startDate || undefined,
        endDate: advancedFilters.endDate || undefined,
        hasAttachments: advancedFilters.hasAttachments || undefined,
        isRead: advancedFilters.isRead !== null ? advancedFilters.isRead : undefined,
        isStarred: advancedFilters.isStarred || undefined,
        isImportant: advancedFilters.isImportant || undefined,
      };
    }

    return {
      limit: 50,
      ...activeFolder.queryOverrides,
      search: advancedFilters.searchQuery || searchQuery || undefined,
      from: advancedFilters.from || undefined,
      to: advancedFilters.to || undefined,
      subject: advancedFilters.subject || undefined,
      labelIds: advancedFilters.labelIds || undefined,
      ...(advancedFilters.startDate ? { startDate: advancedFilters.startDate } : {}),
      ...(advancedFilters.endDate ? { endDate: advancedFilters.endDate } : {}),
      ...(advancedFilters.hasAttachments !== undefined ? { hasAttachments: advancedFilters.hasAttachments } : {}),
      ...(advancedFilters.isRead != null ? { isRead: advancedFilters.isRead } : {}),
      ...(advancedFilters.isStarred !== undefined ? { isStarred: advancedFilters.isStarred } : {}),
      ...(advancedFilters.isImportant !== undefined ? { isImportant: advancedFilters.isImportant } : {}),
    };
  }, [activeFolder, advancedFilters, labelFolderId, searchQuery]);

  // Build conversation params
  const conversationParams = useMemo(() => {
    return {
      limit: 50,
      providerId: activeFolder?.providerId,
      folder:
        activeFolder?.filterFolder ||
        activeFolder?.queryOverrides?.folder ||
        activeFolder?.specialUse ||
        activeFolder?.queryOverrides?.specialUse,
    };
  }, [activeFolder]);

  // Infinite queries
  const emailsQuery = useInfiniteEmails(emailListParams, {
    enabled: Boolean(activeFolder) && useEmailListView,
  });

  const conversationsQuery = useInfiniteConversations(conversationParams, {
    enabled: Boolean(activeFolder) && !useEmailListView,
  });

  // Flatten paginated results
  const emailThreads = useMemo(
    () => emailsQuery.data?.pages.flatMap((page) => page.emails) ?? [],
    [emailsQuery.data],
  );

  const conversationThreads = useMemo(
    () => conversationsQuery.data?.pages.flatMap((page) => page.conversations) ?? [],
    [conversationsQuery.data],
  );

  // Unified threads array with starred emails first (Outlook-like behavior)
  const threads = useMemo<(Email | Conversation)[]>(() => {
    let result: (Email | Conversation)[];

    if (useEmailListView) {
      result = emailThreads.map((e) => mapApiEmailToStore(e as unknown as ApiEmail));
    } else {
      result = [...conversationThreads];
    }

    // Sort: starred emails first, then by date (preserving original order within each group)
    return result.sort((a, b) => {
      const aStarred = 'isStarred' in a ? a.isStarred : false;
      const bStarred = 'isStarred' in b ? b.isStarred : false;

      // If both have same starred status, maintain original order (by date)
      if (aStarred === bStarred) return 0;

      // Starred items come first
      return aStarred ? -1 : 1;
    });
  }, [conversationThreads, emailThreads, useEmailListView]);

  // Loading states
  const listLoading = useEmailListView
    ? emailsQuery.isPending || emailsQuery.isFetchingNextPage
    : conversationsQuery.isPending || conversationsQuery.isFetchingNextPage;

  const hasMoreItems = useEmailListView
    ? Boolean(emailsQuery.hasNextPage)
    : Boolean(conversationsQuery.hasNextPage);

  // Load more handler
  const onLoadMoreThreads = useCallback(() => {
    if (useEmailListView) {
      if (emailsQuery.hasNextPage && !emailsQuery.isFetchingNextPage) {
        void emailsQuery.fetchNextPage();
      }
      return;
    }

    if (conversationsQuery.hasNextPage && !conversationsQuery.isFetchingNextPage) {
      void conversationsQuery.fetchNextPage();
    }
  }, [conversationsQuery, emailsQuery, useEmailListView]);

  // Load folder metadata
  const loadFolderMetadata = useCallback(async () => {
    try {
      setFoldersLoading(true);
      const folderResponse = await getFolders();
      setFoldersData(folderResponse.providers, folderResponse.foldersByProvider);
      setProviders(folderResponse.providers);
      setFoldersLoading(false);
    } catch (error) {
      logger.error('Failed to load folders', { error });
      setFoldersLoading(false);
    }
  }, [setFoldersData]);

  // Get default provider for compose
  const defaultProviderId = useMemo(() => {
    return providers.find(p => p.isDefault)?.id || providers[0]?.id;
  }, [providers]);

  return {
    // Data
    emailStats,
    threads,
    providers,

    // Loading states
    listLoading,
    foldersLoading,
    hasMoreItems,

    // View state
    isConversationView,
    useEmailListView,
    labelFolderId,

    // Handlers
    loadFolderMetadata,
    onLoadMoreThreads,

    // Provider
    defaultProviderId,

    // Queries for direct access
    emailsQuery,
    conversationsQuery,
  };
}

export type UseMailboxDataReturn = ReturnType<typeof useMailboxData>;
