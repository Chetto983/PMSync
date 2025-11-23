import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Inbox,
  Star,
  Mail as MailIcon,
  Paperclip,
  Clock,
  Calendar as CalendarIcon,
} from 'lucide-react';
import { Snackbar, Alert as MuiAlert, Box, useMediaQuery, useTheme, Chip, Alert, Stack, Typography, Button, CircularProgress } from '@mui/material';
import { debounce } from 'lodash-es';
import { emailApi, type EmailListParams } from '@/lib/api/email';
import { providersApi, type ProviderConfig } from '@/lib/api/providers';
import { getFolders, type Folder as ProviderFolder } from '@/lib/api/folders';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useEmailStore, type Email } from '@/stores/email-store';
import { useAuthStore } from '@/stores/auth-store';
import { useEmailActions } from '@/hooks/use-email-actions';
import { useKeyboardNavigation } from '@/hooks/use-keyboard-navigation';
import { useWebSocket } from '@/hooks/use-websocket';
import { normalizeFolderName, getFolderIcon as getIconForFolderUtil } from '@/lib/utils/folder-normalization';

// Components
import { EmailLayout } from '@/components/email/EmailLayout';
import { EmailSidebar, type FolderGroup, type SmartFilter } from '@/components/email/EmailSidebar/EmailSidebar';
import { ThreadList } from '@/components/email/ThreadList';
import { ThreadDisplay } from '@/components/email/ThreadDisplay';
import { ComposeDialog } from '@/components/email/ComposeDialog/ComposeDialog';
import { AdvancedSearchDialog, type AdvancedSearchFilters } from '@/components/email/AdvancedSearchDialog';
import { LabelManager } from '@/components/labels';
import { BulkActionBar } from '@/components/email/BulkActionBar';
import { LabelSelectorDialog } from '@/components/email/LabelSelectorDialog';
import { FolderSelectorDialog } from '@/components/email/FolderSelectorDialog';

interface FolderItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  count?: number;
  color?: string;
  providerId?: string;
  providerEmail?: string;
  filterFolder?: string;
  queryOverrides?: Partial<EmailListParams>;
  aggregate?: boolean;
  specialUse?: string;
}

/**
 * Map API email to store email format
 * Handles field name differences between API and store
 */
function mapApiEmailToStore(apiEmail: any): any {
  return {
    ...apiEmail,
    // Map isFlagged (API) to isImportant (store)
    isImportant: apiEmail.isFlagged || false,
    // Calculate hasAttachments from attachments array
    hasAttachments: apiEmail.attachments && apiEmail.attachments.length > 0,
  };
}

/**
 * Mailbox - Modern email interface with unified components
 *
 * Uses:
 * - EmailLayout for container structure
 * - EmailSidebar for folder navigation
 * - ThreadList for unified email/conversation list
 * - ThreadDisplay for email detail view
 * - email-store for global state
 * - Custom hooks for actions and keyboard navigation
 */
export function Mailbox() {
  const t = useTranslations();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const localText = useMemo(() => {
    const rt = (t as any)?.dashboard?.email?.realtime || {};
    const empty = (t as any)?.dashboard?.email?.empty || {};
    return {
      connection: {
        connecting: rt.connecting ?? t?.common?.loading ?? 'Connecting...',
        live: rt.live ?? 'Live',
        reconnecting: rt.reconnecting ?? 'Reconnecting...',
        warning: rt.disconnectedNotice ?? 'Realtime disconnected. Data may be stale until connection is restored.',
      },
      empty: {
        defaultTitle: empty.defaultTitle ?? 'No emails',
        defaultSubtitle: empty.defaultSubtitle ?? t?.common?.allCaughtUp ?? 'All caught up',
        trashTitle: empty.trashTitle ?? 'Trash is empty',
        trashSubtitle: empty.trashSubtitle ?? 'No deleted messages here.',
        sentTitle: empty.sentTitle ?? 'No sent emails',
        sentSubtitle: empty.sentSubtitle ?? 'Send your first message to see it here.',
        unreadTitle: empty.unreadTitle ?? 'No unread emails',
        unreadSubtitle: empty.unreadSubtitle ?? 'You are all caught up.',
        labelTitle: empty.labelTitle ?? 'No emails with this label',
        labelSubtitle: empty.labelSubtitle ?? 'Try another label or clear filters.',
      },
    };
  }, [t]);

  // Auth store - for WebSocket token
  const { token } = useAuthStore();

  // Store state
  const {
    emails: storeEmails,
    selectedEmail: storeSelectedEmail,
    isLoading: storeLoading,
    selectedIds,
    setEmails,
    appendEmails,
    setSelectedEmail,
    setLoading,
    toggleSelection,
    selectAll,
    clearSelection,
    markAsRead: storeMarkAsRead,
    bulkDelete: storeBulkDelete,
    markAsStarred: storeMarkAsStarred,
    markAsImportant: storeMarkAsImportant,
  } = useEmailStore();

  // WebSocket for real-time updates (email events, folder counts, etc.)
  const { isConnected, connectionStatus } = useWebSocket(token, true);

  // Local state for folders and UI
  const [remoteFolders, setRemoteFolders] = useState<FolderItem[]>([]);
  const [foldersLoading, setFoldersLoading] = useState(false);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [searchQuery] = useState('');
  const [, setRefreshing] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeMode, setComposeMode] = useState<'compose' | 'reply' | 'forward'>('compose');
  const [composePrefill, setComposePrefill] = useState<any>(null);
  const [advancedSearchOpen, setAdvancedSearchOpen] = useState(false);
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedSearchFilters>({});
  const [_pagination, setPagination] = useState({ page: 1, hasMore: true, total: 0 });
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error' | 'warning' | 'info';
  }>({
    open: false,
    message: '',
    severity: 'info',
  });
  const [emailStats, setEmailStats] = useState<{ total: number; unread: number; starred: number } | null>(null);
  const [retentionStats, setRetentionStats] = useState<{ totalEmails: number; archivedEmails: number; estimatedSpaceSavedMB: number } | null>(null);
  const [syncStatusMessage, setSyncStatusMessage] = useState<string | null>(null);
  const [syncLoading, setSyncLoading] = useState(false);
  const [retentionLoading, setRetentionLoading] = useState(false);

  const getEmptyState = useCallback(() => {
    if (!selectedFolderId) {
      return { title: localText.empty.defaultTitle, subtitle: localText.empty.defaultSubtitle };
    }
    if (selectedFolderId === 'TRASH') {
      return { title: localText.empty.trashTitle, subtitle: localText.empty.trashSubtitle };
    }
    if (selectedFolderId === 'SENT') {
      return { title: localText.empty.sentTitle, subtitle: localText.empty.sentSubtitle };
    }
    if (selectedFolderId.startsWith('smart:unread')) {
      return { title: localText.empty.unreadTitle, subtitle: localText.empty.unreadSubtitle };
    }
    if (selectedFolderId.startsWith('label:')) {
      return { title: localText.empty.labelTitle, subtitle: localText.empty.labelSubtitle };
    }
    return { title: localText.empty.defaultTitle, subtitle: localText.empty.defaultSubtitle };
  }, [selectedFolderId, localText]);

  // Load stats, retention, sync status
  useEffect(() => {
    emailApi.getStats().then((stats) => {
      setEmailStats({
        total: stats.total,
        unread: stats.unread,
        starred: stats.starred,
      });
    }).catch(() => {});

    emailApi.getRetentionStats().then((stats) => {
      setRetentionStats({
        totalEmails: stats.totalEmails,
        archivedEmails: stats.archivedEmails,
        estimatedSpaceSavedMB: stats.estimatedSpaceSavedMB,
      });
    }).catch(() => {});

    emailApi.getSyncStatus().then((status) => {
      setSyncStatusMessage(JSON.stringify(status));
    }).catch(() => {});
  }, []);

  const handleSyncProviders = async () => {
    if (!providers || providers.length === 0) return;
    setSyncLoading(true);
    try {
      await Promise.all(providers.map((p) => emailApi.syncProvider(p.id)));
      setSyncStatusMessage('Sync triggered for all providers');
      const stats = await emailApi.getStats();
      setEmailStats({ total: stats.total, unread: stats.unread, starred: stats.starred });
    } catch {
      setSyncStatusMessage('Sync failed');
    } finally {
      setSyncLoading(false);
    }
  };

  const handleRunRetention = async () => {
    setRetentionLoading(true);
    try {
      const res = await emailApi.runRetention();
      setRetentionStats((prev) => prev ? { ...prev, archivedEmails: res.count + (prev.archivedEmails ?? 0) } : prev);
      setSyncStatusMessage(`Retention run on ${res.count} emails`);
    } catch {
      setSyncStatusMessage('Retention run failed');
    } finally {
      setRetentionLoading(false);
    }
  };

  // Mobile sidebar state
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Refs for logging without causing dependency issues
  const storeEmailsRef = useRef(storeEmails);

  // Update refs on each render
  useEffect(() => {
    storeEmailsRef.current = storeEmails;
  });

  // Label manager state
  const [labelManagerOpen, setLabelManagerOpen] = useState(false);
  const [labelSelectorOpen, setLabelSelectorOpen] = useState(false);
  const [folderSelectorOpen, setFolderSelectorOpen] = useState(false);

  // Custom hooks
  const {
    handleDelete,
    handleToggleRead,
    handleToggleStar,
    handleToggleImportant,
    handleArchive,
    handleReply,
    //handleForward,
    handleEmailClick: handleEmailClickOriginal,
  } = useEmailActions({
    onSuccess: (message) => {
      setSnackbar({
        open: true,
        message,
        severity: 'success',
      });
    },
    onError: (message) => {
      setSnackbar({
        open: true,
        message,
        severity: 'error',
      });
    },
  });

  // Wrapper to handle both Email and Conversation types
  const handleEmailClick = useCallback((thread: any) => {
    if ('providerId' in thread) {
      handleEmailClickOriginal(thread);
    }
  }, [handleEmailClickOriginal]);

  // Smart Filters for quick access
  const smartFilters = useMemo<SmartFilter[]>(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());

    return [
      {
        id: 'smart:unread',
        label: t.dashboard.email.quickFilters.unread,
        icon: <MailIcon size={18} />,
        color: '#0B7EFF',
      },
      {
        id: 'smart:today',
        label: t.dashboard.email.quickFilters.today,
        icon: <Clock size={18} />,
        color: '#00C853',
      },
      {
        id: 'smart:this-week',
        label: t.dashboard.email.quickFilters.thisWeek,
        icon: <CalendarIcon size={18} />,
        color: '#9C27B0',
      },
      {
        id: 'smart:attachments',
        label: t.dashboard.email.quickFilters.hasAttachments,
        icon: <Paperclip size={18} />,
        color: '#FF9800',
      },
      {
        id: 'smart:important',
        label: t.dashboard.email.quickFilters.important,
        icon: <Star size={18} />,
        color: '#FFB300',
      },
    ];
  }, [t]);

  // Aggregator folders (All Inbox, All Starred)
  const aggregatorFolders = useMemo<FolderItem[]>(
    () => [
      {
        id: 'all:inbox',
        label: t.dashboard.folders.inbox,
        icon: <Inbox size={20} />,
        aggregate: true,
        queryOverrides: { folder: 'INBOX' },
      },
      {
        id: 'all:starred',
        label: t.dashboard.email.starredFolderLabel || t.dashboard.folders.starred,
        icon: <Star size={20} />,
        color: '#FFB300',
        aggregate: true,
        queryOverrides: { isStarred: true },
      },
    ],
    [t]
  );

  // Convert smart filters to folder items for unified handling
  const smartFilterFolders = useMemo<FolderItem[]>(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endOfToday = new Date(today);
    endOfToday.setHours(23, 59, 59, 999);

    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    return smartFilters.map((filter) => {
      let queryOverrides: Partial<EmailListParams> = {};

      switch (filter.id) {
        case 'smart:unread':
          queryOverrides = { isRead: false };
          break;
        case 'smart:today':
          queryOverrides = {
            startDate: today.toISOString(),
            endDate: endOfToday.toISOString(),
          };
          break;
        case 'smart:this-week':
          queryOverrides = {
            startDate: startOfWeek.toISOString(),
            endDate: endOfWeek.toISOString(),
          };
          break;
        case 'smart:attachments':
          queryOverrides = { hasAttachments: true };
          break;
        case 'smart:important':
          queryOverrides = { isStarred: true };
          break;
      }

      return {
        id: filter.id,
        label: filter.label,
        icon: filter.icon,
        count: filter.count,
        color: filter.color,
        aggregate: true,
        queryOverrides,
      };
    });
  }, [smartFilters]);

  // Combined folders
  const combinedFolders = useMemo(
    () => [...smartFilterFolders, ...aggregatorFolders, ...remoteFolders],
    [smartFilterFolders, aggregatorFolders, remoteFolders]
  );

  // Folders grouped by provider for sidebar
  const folderGroups = useMemo<FolderGroup[]>(() => {
    const groups: FolderGroup[] = [];

    if (aggregatorFolders.length) {
      groups.push({
        providerId: 'all',
        providerEmail: t.dashboard.email.allAccountsLabel || 'All accounts',
        folders: aggregatorFolders,
      });
    }

    const providerMap = new Map<
      string,
      { providerId: string; providerEmail: string; folders: FolderItem[] }
    >();

    remoteFolders.forEach((folder) => {
      if (!folder.providerId) return;
      if (!providerMap.has(folder.providerId)) {
        providerMap.set(folder.providerId, {
          providerId: folder.providerId,
          providerEmail: folder.providerEmail || t.dashboard.email.noProviders,
          folders: [],
        });
      }
      providerMap.get(folder.providerId)!.folders.push(folder);
    });

    groups.push(
      ...Array.from(providerMap.values()).sort((a, b) =>
        a.providerEmail.localeCompare(b.providerEmail)
      )
    );

    return groups;
  }, [aggregatorFolders, remoteFolders, t]);

  // Get provider icon
  const getProviderIcon = useCallback((providerId: string) => {
    const provider = providers.find((p) => p.id === providerId);
    if (!provider) return null;
    // Return icon based on provider type
    return provider.providerType === 'google' ? '📧' : '📨';
  }, [providers]);

  // Load folder metadata
  const loadFolderMetadata = useCallback(async () => {
    try {
      setFoldersLoading(true);
      const folderResponse = await getFolders();

      const normalized: FolderItem[] = [];
      Object.entries(folderResponse.foldersByProvider).forEach(
        ([providerId, folders]) => {
          const provider = folderResponse.providers.find((p) => p.id === providerId);
          folders.forEach((folder: ProviderFolder) => {
            const folderName = normalizeFolderName(folder.name, folder.specialUse);
            const IconComponent = getIconForFolderUtil(folder.specialUse);
            normalized.push({
              id: folder.id,
              label: folder.name,
              icon: <IconComponent size={20} />,
              count: folder.unreadCount,
              providerId: folder.providerId,
              providerEmail: provider?.email || '',
              filterFolder: folderName,
              specialUse: folder.specialUse,
              queryOverrides: {
                providerId: folder.providerId,
                folder: folderName,
              },
            });
          });
        }
      );

      setRemoteFolders(normalized);
      setFoldersLoading(false);
    } catch (error) {
      console.error('Failed to load folders:', error);
      setFoldersLoading(false);
    }
  }, []);

  // Load emails data
  const loadData = useCallback(async () => {
    // Calculate active folder directly from selectedFolderId to avoid stale closure
    const currentActiveFolder = combinedFolders.find((folder) => folder.id === selectedFolderId) ||
      combinedFolders[0] ||
      null;

    if (!currentActiveFolder) {
      return;
    }

    try {
      setLoading(true);

      const providersRes = await providersApi.getProviders();
      setProviders(providersRes || []);

      // Check if filtering by label
      if (currentActiveFolder.id.startsWith('label:')) {
        const labelId = currentActiveFolder.id.replace('label:', '');
        // For now, just use regular email list with filter
        // TODO: Backend should support filtering by label in listEmails endpoint
        const queryParams: EmailListParams = {
          limit: 50,
          page: 1,
          search: advancedFilters.searchQuery || searchQuery || undefined,
          from: advancedFilters.from || undefined,
          startDate: advancedFilters.startDate || undefined,
          endDate: advancedFilters.endDate || undefined,
          hasAttachments: advancedFilters.hasAttachments || undefined,
          isRead: advancedFilters.isRead !== null ? advancedFilters.isRead : undefined,
          isStarred: advancedFilters.isStarred || undefined,
        };

        const emailsRes = await emailApi.listEmails(queryParams);
        // Filter emails by label client-side for now
        const filteredEmails = (emailsRes.data.emails || [])
          .filter((email: any) => email.labels && email.labels.includes(labelId))
          .map(mapApiEmailToStore);
        setEmails(filteredEmails as any);
        setSelectedEmail(null);

        // Update pagination (approximate since we're filtering client-side)
        setPagination({
          page: 1,
          hasMore: false, // Disable pagination for label filtering for now
          total: filteredEmails.length,
        });
      } else {
        // Build query params with proper priority: advanced filters override quick filters
        const queryParams: EmailListParams = {
          limit: 50,
          page: 1,
          ...currentActiveFolder.queryOverrides,
          search: advancedFilters.searchQuery || searchQuery || undefined,
          from: advancedFilters.from || undefined,
          // Only override date filters if advanced filters are set
          ...(advancedFilters.startDate ? { startDate: advancedFilters.startDate } : {}),
          ...(advancedFilters.endDate ? { endDate: advancedFilters.endDate } : {}),
          // Only override boolean filters if advanced filters are explicitly set
          ...(advancedFilters.hasAttachments !== undefined ? { hasAttachments: advancedFilters.hasAttachments } : {}),
          ...(advancedFilters.isRead != null ? { isRead: advancedFilters.isRead } : {}),
          ...(advancedFilters.isStarred !== undefined ? { isStarred: advancedFilters.isStarred } : {}),
        };

        const emailsRes = await emailApi.listEmails(queryParams);

        setEmails((emailsRes.data.emails || []).map(mapApiEmailToStore) as any);
        setSelectedEmail(null);

        // Update pagination
        setPagination({
          page: 1,
          hasMore: emailsRes.data.pagination.page < emailsRes.data.pagination.totalPages,
          total: emailsRes.data.pagination.total,
        });
      }
    } catch (error) {
      console.error('Failed to load mailbox data:', error);
      setEmails([]);
      setSelectedEmail(null);
      setPagination({ page: 1, hasMore: false, total: 0 });
    } finally {
      setLoading(false);
    }
  }, [combinedFolders, selectedFolderId, searchQuery, advancedFilters, setEmails, setLoading, setSelectedEmail]);

  // Handle label changes - backend always returns updated email
  const handleLabelsChange = useCallback(async (emailId: string, labelIds: string[], updatedEmail?: any) => {
    if (!updatedEmail) {
      console.warn('[Mailbox] No updated email provided - this should not happen');
      return;
    }

    console.log('[Mailbox] handleLabelsChange:', {
      emailId,
      labelIds,
      updatedEmail,
    });

    // Update email in store with backend data
    setEmails(
      storeEmails.map(email =>
        email.id === emailId ? updatedEmail : email
      )
    );

    // Also update selected email if it's the one being modified
    if (storeSelectedEmail?.id === emailId) {
      setSelectedEmail(updatedEmail);
    }

    setSnackbar({
      open: true,
      message: t.common.save || 'Labels updated',
      severity: 'success',
    });
  }, [storeEmails, setEmails, storeSelectedEmail, setSelectedEmail, t]);

  // Refresh emails
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  // Load more emails (infinite scroll)
  const loadMoreEmails = useCallback(async () => {
    if (!_pagination.hasMore || storeLoading) return;

    try {
      setLoading(true);
      const nextPage = _pagination.page + 1;
      const currentActiveFolder = combinedFolders.find((f) => f.id === selectedFolderId);
      if (!currentActiveFolder) return;

      const queryParams: EmailListParams = {
        limit: 50,
        page: nextPage,
        ...currentActiveFolder.queryOverrides,
        search: advancedFilters.searchQuery || searchQuery || undefined,
        from: advancedFilters.from || undefined,
        ...(advancedFilters.startDate ? { startDate: advancedFilters.startDate } : {}),
        ...(advancedFilters.endDate ? { endDate: advancedFilters.endDate } : {}),
        ...(advancedFilters.hasAttachments !== undefined ? { hasAttachments: advancedFilters.hasAttachments } : {}),
        ...(advancedFilters.isRead != null ? { isRead: advancedFilters.isRead } : {}),
        ...(advancedFilters.isStarred !== undefined ? { isStarred: advancedFilters.isStarred } : {}),
      };

      const emailsRes = await emailApi.listEmails(queryParams);
      const newEmails = (emailsRes.data.emails || []).map(mapApiEmailToStore);

      // Append new emails to existing ones
      appendEmails(newEmails as any);

      // Update pagination
      setPagination({
        page: nextPage,
        hasMore: emailsRes.data.pagination.page < emailsRes.data.pagination.totalPages,
        total: emailsRes.data.pagination.total,
      });
    } catch (error) {
      console.error('Failed to load more emails:', error);
    } finally {
      setLoading(false);
    }
  }, [_pagination, storeLoading, combinedFolders, selectedFolderId, searchQuery, advancedFilters, appendEmails, setLoading]);

  // Bulk operations handlers
  const handleBulkMarkRead = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    try {
      await emailApi.bulkMarkRead(ids, true);
      storeMarkAsRead(ids);
      setSnackbar({
        open: true,
        message: t.dashboard.email.messages.markRead.replace('{count}', ids.length.toString()),
        severity: 'success',
      });
    } catch (error) {
      console.error('Failed to mark emails as read:', error);
      setSnackbar({
        open: true,
        message: t.dashboard.email.messages.markReadFailed,
        severity: 'error',
      });
    }
  }, [selectedIds, storeMarkAsRead, t.dashboard.email.messages.markRead, t.dashboard.email.messages.markReadFailed]);

  const handleBulkMarkUnread = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    try {
      await emailApi.bulkMarkRead(ids, false);
      // Update store - we need to mark as unread
      storeEmails.forEach(email => {
        if (ids.includes(email.id)) {
          useEmailStore.getState().updateEmail(email.id, { isRead: false });
        }
      });
      setSnackbar({
        open: true,
        message: t.dashboard.email.messages.markUnread.replace('{count}', ids.length.toString()),
        severity: 'success',
      });
    } catch (error) {
      console.error('Failed to mark emails as unread:', error);
      setSnackbar({
        open: true,
        message: t.dashboard.email.messages.markUnreadFailed,
        severity: 'error',
      });
    }
  }, [selectedIds, storeEmails, t.dashboard.email.messages.markUnread, t.dashboard.email.messages.markUnreadFailed]);

  const handleBulkDelete = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    if (!window.confirm(t.dashboard.email.messages.deleteConfirm.replace('{count}', ids.length.toString()))) {
      return;
    }

    try {
      await emailApi.bulkDelete(ids);
      storeBulkDelete(ids);
      clearSelection();
      setSnackbar({
        open: true,
        message: t.dashboard.email.messages.deleted.replace('{count}', ids.length.toString()),
        severity: 'success',
      });
    } catch (error) {
      console.error('Failed to delete emails:', error);
      setSnackbar({
        open: true,
        message: t.dashboard.email.messages.deleteFailed,
        severity: 'error',
      });
    }
  }, [selectedIds, storeBulkDelete, clearSelection, t.dashboard.email.messages.deleteConfirm, t.dashboard.email.messages.deleted, t.dashboard.email.messages.deleteFailed]);

  const handleBulkStar = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    try {
      await emailApi.bulkStar(ids, true);
      storeMarkAsStarred(ids, true);
      setSnackbar({
        open: true,
        message: t.dashboard.email.messages.starred.replace('{count}', ids.length.toString()),
        severity: 'success',
      });
    } catch (error) {
      console.error('Failed to star emails:', error);
      setSnackbar({
        open: true,
        message: t.dashboard.email.messages.starFailed,
        severity: 'error',
      });
    }
  }, [selectedIds, storeMarkAsStarred, t.dashboard.email.messages.starred, t.dashboard.email.messages.starFailed]);

  const handleBulkUnstar = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    try {
      await emailApi.bulkStar(ids, false);
      storeMarkAsStarred(ids, false);
      setSnackbar({
        open: true,
        message: t.dashboard.email.messages.unstarred.replace('{count}', ids.length.toString()),
        severity: 'success',
      });
    } catch (error) {
      console.error('Failed to unstar emails:', error);
      setSnackbar({
        open: true,
        message: t.dashboard.email.messages.unstarFailed,
        severity: 'error',
      });
    }
  }, [selectedIds, storeMarkAsStarred, t.dashboard.email.messages.unstarred, t.dashboard.email.messages.unstarFailed]);

  const handleBulkFlag = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    try {
      await emailApi.bulkFlag(ids, true);
      storeMarkAsImportant(ids, true);
      setSnackbar({
        open: true,
        message: `Marked ${ids.length} email(s) as important`,
        severity: 'success',
      });
    } catch (error) {
      console.error('Failed to flag emails:', error);
      setSnackbar({
        open: true,
        message: 'Failed to mark as important. Please try again.',
        severity: 'error',
      });
    }
  }, [selectedIds, storeMarkAsImportant]);

  const handleBulkUnflag = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    try {
      await emailApi.bulkFlag(ids, false);
      storeMarkAsImportant(ids, false);
      setSnackbar({
        open: true,
        message: `Unmarked ${ids.length} email(s) as important`,
        severity: 'success',
      });
    } catch (error) {
      console.error('Failed to unflag emails:', error);
      setSnackbar({
        open: true,
        message: 'Failed to unmark as important. Please try again.',
        severity: 'error',
      });
    }
  }, [selectedIds, storeMarkAsImportant]);

  const handleBulkAddLabels = useCallback(async (labelIds: string[]) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0 || labelIds.length === 0) return;

    try {
      await emailApi.bulkAddLabels(ids, labelIds);
      clearSelection();
      await handleRefresh(); // Reload to show updated labels
      setSnackbar({
        open: true,
        message: t.dashboard.email.messages.labelsAdded.replace('{count}', ids.length.toString()),
        severity: 'success',
      });
    } catch (error) {
      console.error('Failed to add labels:', error);
      setSnackbar({
        open: true,
        message: t.dashboard.email.messages.labelsFailed,
        severity: 'error',
      });
    }
  }, [selectedIds, clearSelection, handleRefresh, t.dashboard.email.messages.labelsAdded, t.dashboard.email.messages.labelsFailed]);

  const handleBulkMoveToFolder = useCallback(async (folder: string) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    try {
      await emailApi.bulkMoveToFolder(ids, folder);
      // Remove moved emails from current view
      storeBulkDelete(ids);
      clearSelection();
      setSnackbar({
        open: true,
        message: t.dashboard.email.messages.moved.replace('{count}', ids.length.toString()).replace('{folder}', folder),
        severity: 'success',
      });
    } catch (error) {
      console.error('Failed to move emails:', error);
      setSnackbar({
        open: true,
        message: t.dashboard.email.messages.moveFailed,
        severity: 'error',
      });
    }
  }, [selectedIds, storeBulkDelete, clearSelection, t.dashboard.email.messages.moved, t.dashboard.email.messages.moveFailed]);

  // Load folders on mount
  useEffect(() => {
    loadFolderMetadata();
  }, [loadFolderMetadata]);

  // Auto-select first folder when folders are loaded
  useEffect(() => {
    if (!selectedFolderId && combinedFolders.length > 0) {
      setSelectedFolderId(combinedFolders[0].id);
    }
  }, [combinedFolders, selectedFolderId]);

  // Ref to always access latest loadData without triggering useMemo dependencies
  const loadDataRef = useRef(loadData);
  useEffect(() => {
    loadDataRef.current = loadData;
  });

  // Create a debounced version of loadData for filter changes (500ms delay)
  const debouncedLoadData = useMemo(
    () =>
      debounce(() => {
        if (loadDataRef.current) {
          loadDataRef.current();
        }
      }, 500),
    []
  );

  // Load emails immediately when folder ID changes
  useEffect(() => {
    if (selectedFolderId) {
      // Cancel any pending debounced loads from filter changes
      debouncedLoadData.cancel();
      // Load immediately
      loadData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFolderId]);

  // Load emails with debounce when advanced filters change
  useEffect(() => {
    if (selectedFolderId) {
      debouncedLoadData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [advancedFilters]);

  // Keyboard navigation
  useKeyboardNavigation({
    emails: storeEmails,
    enabled: true,
    onDelete: handleDelete,
    onReply: handleReply,
    onToggleStar: handleToggleStar,
  });

  // Get default provider for compose
  const defaultProviderId = useMemo(() => {
    return providers.find(p => p.isDefault)?.id || providers[0]?.id;
  }, [providers]);

  // Handle advanced search
  const handleAdvancedSearch = useCallback((filters: AdvancedSearchFilters) => {
    setAdvancedFilters(filters);
    // Reload data with new filters (loadData will be called via useEffect since advancedFilters changes)
  }, []);

  // Reset advanced filters
  const handleResetFilters = useCallback(() => {
    setAdvancedFilters({});
  }, []);

  // Handle Reply - open ComposeDialog instead of redirect
  const handleReplyLocal = useCallback((email: Email) => {
    setComposeMode('reply');
    setComposePrefill({
      to: [email.from],
      subject: email.subject.startsWith('Re:') ? email.subject : `Re: ${email.subject}`,
      body: `<br/><br/>On ${new Date(email.receivedAt).toLocaleString()}, ${email.from} wrote:<br/><blockquote>${email.bodyHtml || email.bodyText}</blockquote>`,
      inReplyTo: email.externalId,
      references: email.references || email.externalId,
    });
    setComposeOpen(true);
  }, []);

  // Handle Reply All - open ComposeDialog
  const handleReplyAllLocal = useCallback((email: Email) => {
    const allRecipients = [email.from, ...(!email.to ? []  : email.to), ...(!email.cc ? [] : email.cc)];
    const uniqueRecipients = Array.from(new Set(allRecipients));

    setComposeMode('reply');
    setComposePrefill({
      to: uniqueRecipients,
      subject: email.subject.startsWith('Re:') ? email.subject : `Re: ${email.subject}`,
      body: `<br/><br/>On ${new Date(email.receivedAt).toLocaleString()}, ${email.from} wrote:<br/><blockquote>${email.bodyHtml || email.bodyText}</blockquote>`,
      inReplyTo: email.externalId,
      references: email.references || email.externalId,
    });
    setComposeOpen(true);
  }, []);

  // Handle Forward - open ComposeDialog
  const handleForwardLocal = useCallback((email: Email) => {
    setComposeMode('forward');
    setComposePrefill({
      subject: email.subject.startsWith('Fwd:') ? email.subject : `Fwd: ${email.subject}`,
      body: `<br/><br/>---------- Forwarded message ---------<br/>From: ${email.from}<br/>Date: ${new Date(email.receivedAt).toLocaleString()}<br/>Subject: ${email.subject}<br/>To: ${email.to?.join(', ') || ''}<br/><br/>${email.bodyHtml || email.bodyText}`,
    });
    setComposeOpen(true);
  }, []);


  return (
    <>
      <EmailLayout
          sidebarOpen={mobileSidebarOpen}
          onSidebarClose={() => setMobileSidebarOpen(false)}
          sidebar={
          <EmailSidebar
            folderGroups={folderGroups}
            selectedFolderId={selectedFolderId}
            onFolderSelect={(folderId) => {
              setSelectedFolderId(folderId);
              if (isMobile) {
                setMobileSidebarOpen(false);
              }
            }}
            loading={foldersLoading}
            smartFilters={smartFilters}
            showSmartFilters={true}
            showLabels={true}
            onManageLabels={() => setLabelManagerOpen(true)}
            onCompose={() => setComposeOpen(true)}
          />
        }
        list={
          <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', px: 2, py: 1 }}>
              <Chip
                size="small"
                label={
                  connectionStatus === 'connecting'
                    ? localText.connection.connecting
                    : isConnected
                      ? localText.connection.live
                      : localText.connection.reconnecting
                }
                color={isConnected ? 'success' : 'warning'}
                variant={isConnected ? 'filled' : 'outlined'}
              />
            </Box>
            {!isConnected && (
              <Box sx={{ px: 2, pb: 1 }}>
                <Alert severity="warning" variant="outlined">
                  {localText.connection.warning}
                </Alert>
              </Box>
            )}
            <Box sx={{ px: 2, pb: 1 }}>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                {emailStats && (
                  <Typography variant="caption" color="text.secondary">
                    Total: {emailStats.total} · Unread: {emailStats.unread} · Starred: {emailStats.starred}
                  </Typography>
                )}
                {retentionStats && (
                  <Typography variant="caption" color="text.secondary">
                    Archived: {retentionStats.archivedEmails} · Saved: {Math.round(retentionStats.estimatedSpaceSavedMB)} MB
                  </Typography>
                )}
                {syncStatusMessage && (
                  <Typography variant="caption" color="text.secondary">
                    {syncStatusMessage}
                  </Typography>
                )}
                <Stack direction="row" spacing={1}>
                  <Button size="small" variant="outlined" onClick={handleSyncProviders} disabled={syncLoading}>
                    {syncLoading ? <CircularProgress size={14} /> : 'Sync now'}
                  </Button>
                  <Button size="small" variant="outlined" onClick={handleRunRetention} disabled={retentionLoading}>
                    {retentionLoading ? <CircularProgress size={14} /> : 'Run retention'}
                  </Button>
                </Stack>
              </Stack>
            </Box>
            {/* Bulk Action Bar */}
            <BulkActionBar
              selectedCount={selectedIds.size}
              totalCount={storeEmails.length}
              onSelectAll={selectAll}
              onClearSelection={clearSelection}
              onMarkRead={handleBulkMarkRead}
              onMarkUnread={handleBulkMarkUnread}
              onDelete={handleBulkDelete}
              onStar={handleBulkStar}
              onUnstar={handleBulkUnstar}
              onFlag={handleBulkFlag}
              onUnflag={handleBulkUnflag}
              onAddLabels={() => setLabelSelectorOpen(true)}
              onMoveToFolder={() => setFolderSelectorOpen(true)}
            />

            {/* Render appropriate view based on mode */}
            <Box sx={{ flex: 1, overflow: 'hidden' }}>
              <ThreadList
                threads={storeEmails}
                selectedId={storeSelectedEmail?.id}
                selectedIds={selectedIds}
                isLoading={storeLoading}
                onThreadClick={handleEmailClick}
                onToggleSelect={toggleSelection}
                onToggleRead={handleToggleRead}
                onToggleStar={handleToggleStar}
                onToggleImportant={handleToggleImportant}
                onArchive={(id) => handleArchive([id])}
                onDelete={handleDelete}
                getProviderIcon={getProviderIcon}
                onLoadMore={loadMoreEmails}
                hasMore={_pagination.hasMore}
                emptyTitle={getEmptyState().title}
                emptySubtitle={getEmptyState().subtitle}
              />
            </Box>
          </Box>
        }
        detail={
          storeSelectedEmail ? (
            <ThreadDisplay
              email={storeSelectedEmail}
              onClose={() => setSelectedEmail(null)}
              onToggleStar={handleToggleStar}
              onArchive={(id) => handleArchive([id])}
              onDelete={handleDelete}
              onReply={handleReplyLocal}
              onReplyAll={handleReplyAllLocal}
              onForward={handleForwardLocal}
              onLabelsChange={handleLabelsChange}
            />
          ) : undefined
        }
        showDetail={!!storeSelectedEmail}
      />

      {/* Snackbar for notifications */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <MuiAlert
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          severity={snackbar.severity}
          variant="filled"
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </MuiAlert>
      </Snackbar>

      {/* Compose Dialog */}
      <ComposeDialog
        open={composeOpen}
        mode={composeMode}
        defaultProviderId={defaultProviderId}
        prefillData={composePrefill}
        onClose={() => {
          setComposeOpen(false);
          setComposeMode('compose');
          setComposePrefill(null);
        }}
        onSent={() => {
          setSnackbar({
            open: true,
            message: t.dashboard.email.messages.emailSent,
            severity: 'success',
          });
          setComposeOpen(false);
          setComposeMode('compose');
          setComposePrefill(null);
          handleRefresh(); // Refresh email list
        }}
        onError={(message) => {
          setSnackbar({
            open: true,
            message,
            severity: 'error',
          });
        }}
      />

      {/* Advanced Search Dialog */}
      <AdvancedSearchDialog
        open={advancedSearchOpen}
        initialFilters={advancedFilters}
        onClose={() => setAdvancedSearchOpen(false)}
        onSearch={handleAdvancedSearch}
        onReset={handleResetFilters}
      />

      {/* Label Manager Dialog */}
      <LabelManager
        open={labelManagerOpen}
        onClose={() => setLabelManagerOpen(false)}
      />

      <LabelSelectorDialog
        open={labelSelectorOpen}
        onClose={() => setLabelSelectorOpen(false)}
        onSelect={handleBulkAddLabels}
        selectedCount={selectedIds.size}
      />

      <FolderSelectorDialog
        open={folderSelectorOpen}
        onClose={() => setFolderSelectorOpen(false)}
        onSelect={handleBulkMoveToFolder}
        selectedCount={selectedIds.size}
      />
    </>
  );
}
