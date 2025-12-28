import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/router';
import { useQueryClient } from '@tanstack/react-query';
import { Snackbar, Alert as MuiAlert, Box, useMediaQuery, useTheme } from '@mui/material';
import {
  DndContext,
  DragStartEvent,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
  pointerWithin,
} from '@dnd-kit/core';
import { emailApi, type EmailListParams, type Conversation } from '@/lib/api/email';

import { logger } from '@/lib/logger';
import { getFolders, type Provider } from '@/lib/api/folders';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useEmailStore, type Email } from '@/stores/email-store';
import { useFoldersStore } from '@/stores/folders-store';
import { websocketClient } from '@/lib/websocket-client';
import { useEmailActions } from '@/hooks/use-email-actions';
import { useComposeHandlers } from '@/components/dashboard/hooks/use-compose-handlers';
import { useKeyboardNavigation } from '@/hooks/use-keyboard-navigation';
import { emailKeys, useEmailStats, useInfiniteConversations, useInfiniteEmails } from '@/hooks/queries';
import { useFolderLogic, type FolderItem } from '@/components/dashboard/hooks/use-folder-logic';
import { useSelectionLogic } from '@/components/dashboard/hooks/use-selection-logic';
import { MailboxHeader } from '@/components/dashboard/MailboxHeader';

// Components
import {
  ResizableEmailLayout,
  EmailSidebar,
  ThreadList,
  ThreadDisplay,
  ComposeDialog,
  AdvancedSearchDialog,
  type AdvancedSearchFilters,
  BulkActionBar,
  LabelSelectorDialog,
  FolderSelectorDialog,
  EmailDragOverlay
} from '@/components/email';
import { LabelManager } from '@/components/labels';

// Interfaces imported from use-folder-logic

/**
 * API Email type (matches backend response)
 * Used for mapping from API to store format
 */
interface ApiEmail {
  id: string;
  providerId: string;
  externalId: string;
  threadId?: string;
  from: string;
  to?: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body?: string;
  bodyPreview?: string;
  bodyHtml?: string;
  bodyText?: string;
  snippet?: string;
  receivedAt: string;
  isRead: boolean;
  isStarred?: boolean;
  isFlagged?: boolean;
  isDraft?: boolean;
  emailLabels?: { label: { id: string; name: string; color?: { backgroundColor: string; textColor: string } | null } }[];
  folder?: string;
  attachments?: { id: string; filename: string; size: number; mimeType: string; isInline: boolean; contentId?: string }[];
  inReplyTo?: string;
  references?: string;
  hasCalendarInvite?: boolean;
  calendarInviteStatus?: 'pending' | 'accepted' | 'declined' | 'tentative';
  calendarInviteData?: {
    summary?: string;
    description?: string;
    location?: string;
    startTime?: string | Date;
    endTime?: string | Date;
    isAllDay?: boolean;
    timezone?: string;
    organizer?: { email: string; name?: string };
    attendees?: Array<{ email: string; name?: string; status?: string }>;
    method?: string;
  } | null;
}

/**
 * Compose prefill data for reply/forward operations
 */
interface ComposePrefillData {
  originalEmailId?: string;
  to?: string[];
  cc?: string[];
  bcc?: string[];
  subject?: string;
  body?: string;
  inReplyTo?: string;
  references?: string;
  draftId?: string;
}

/**
 * Map API email to store email format
 * Handles field name differences between API and store
 */
function mapApiEmailToStore(apiEmail: ApiEmail): Email {
  return {
    ...apiEmail,
    // Map isFlagged (API) to isImportant (store)
    isImportant: apiEmail.isFlagged || false,
    // Calculate hasAttachments from attachments array
    hasAttachments: apiEmail.attachments && apiEmail.attachments.length > 0,
  };
}

/**
 * Props for Mailbox component
 */
interface MailboxProps {
  /**
   * Initial search query from URL or external source
   */
  initialSearchQuery?: string;
  /**
   * Initial email ID to open when component mounts
   */
  initialEmailId?: string;
}

/**
 * Mailbox - Modern email interface with unified components
 *
 * Uses:
 * - ResizableEmailLayout for container structure with resizable panels
 * - EmailSidebar for folder navigation
 * - ThreadList for unified email/conversation list
 * - ThreadDisplay for email detail view
 * - email-store for global state
 * - Custom hooks for actions and keyboard navigation
 */
export function Mailbox({ initialSearchQuery, initialEmailId }: MailboxProps = {}) {
  const router = useRouter();
  const t = useTranslations();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const queryClient = useQueryClient();
  const localText = useMemo(() => {
    return {
      connection: {
        connecting: t.email.realtime.connecting,
        live: t.email.realtime.live,
        reconnecting: t.email.realtime.reconnecting,
        warning: t.email.realtime.disconnectedNotice,
      },
      empty: {
        defaultTitle: t.email.empty.defaultTitle,
        defaultSubtitle: t.email.empty.defaultSubtitle,
        trashTitle: t.email.empty.trashTitle,
        trashSubtitle: t.email.empty.trashSubtitle,
        sentTitle: t.email.empty.sentTitle,
        sentSubtitle: t.email.empty.sentSubtitle,
        unreadTitle: t.email.empty.unreadTitle,
        unreadSubtitle: t.email.empty.unreadSubtitle,
        labelTitle: t.email.empty.labelTitle,
        labelSubtitle: t.email.empty.labelSubtitle,
      },
    };
  }, [t]);

  // Store state
  // Use explicit selectors for better re-render reliability
  const storeSelectedEmail = useEmailStore((state) => state.selectedEmail);

  const setSelectedEmail = useEmailStore((state) => state.setSelectedEmail);
  const toggleSelection = useEmailStore((state) => state.toggleSelection);
  const clearSelection = useEmailStore((state) => state.clearSelection);

  // WebSocket connection status (managed globally in Layout)
  const [isConnected, setIsConnected] = useState(() => websocketClient.isConnected());

  useEffect(() => {
    setIsConnected(websocketClient.isConnected());
    const unsubConnected = websocketClient.onConnected(() => setIsConnected(true));
    const unsubClose = websocketClient.onClose(() => setIsConnected(false));
    return () => {
      unsubConnected();
      unsubClose();
    };
  }, []);

  // Debug: Track selected email changes
  useEffect(() => {
    if (storeSelectedEmail) {
      logger.debug('[Mailbox] Selected email changed', {
        emailId: storeSelectedEmail.id,
        labelCount: storeSelectedEmail.emailLabels?.length,
      });
    }
  }, [storeSelectedEmail]);

  // Folder state derived from store
  const foldersByProvider = useFoldersStore((state) => state.foldersByProvider);
  const setFoldersData = useFoldersStore((state) => state.setFoldersData);
  const [foldersLoading, setFoldersLoading] = useState(false);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [searchQuery] = useState(initialSearchQuery || '');
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeMode, setComposeMode] = useState<'compose' | 'reply' | 'forward'>('compose');
  const [composePrefill, setComposePrefill] = useState<ComposePrefillData | null>(null);
  const [advancedSearchOpen, setAdvancedSearchOpen] = useState(false);
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedSearchFilters>({});
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error' | 'warning' | 'info';
  }>({
    open: false,
    message: '',
    severity: 'info',
  });
  const [_syncStatusMessage, setSyncStatusMessage] = useState<string | null>(null);
  const [syncLoading, setSyncLoading] = useState(false);

  // Conversation vs Email list view toggle (persisted)
  const [forceConversationView, setForceConversationView] = useState<boolean | null>(() => {
    if (typeof window === 'undefined') return null;
    const stored = localStorage.getItem('mailagent-conversation-view');
    return stored === 'true' ? true : stored === 'false' ? false : true;
  });

  const toggleConversationView = useCallback(() => {
    setForceConversationView(prev => {
      const newValue = prev === null ? false : !prev;
      localStorage.setItem('mailagent-conversation-view', String(newValue));
      return newValue;
    });
  }, []);

  const emailStatsQuery = useEmailStats();
  // Retention stats available via useRetentionStats() if needed
  const emailStats = emailStatsQuery.data ?? null;

  // Drag-and-drop state for email-to-folder
  const [draggedEmail, setDraggedEmail] = useState<Email | Conversation | null>(null);
  const [isDraggingEmail, setIsDraggingEmail] = useState(false);

  // Setup DnD sensors with activation constraint to avoid accidental drags
  const dndSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 10, // Require 10px movement before drag starts
      },
    })
  );

  // Handle compose query params (for reply/forward/new compose from other pages)
  useEffect(() => {
    const { compose, replyTo, forward, to, subject } = router.query;

    if (!compose) return;

    const openFromQuery = async () => {
      const storeApi = useEmailStore.getState();

      if (compose === 'reply' && replyTo) {
        const emailId = String(replyTo);

        let originalEmail = storeApi.emails.find((e) => e.id === emailId);
        if (!originalEmail) {
          try {
            const response = await emailApi.getEmail(emailId);
            originalEmail = mapApiEmailToStore(response.data as unknown as ApiEmail);
            storeApi.updateEmail(emailId, originalEmail);
          } catch (error) {
            logger.error('[Mailbox] Failed to fetch email for reply prefill', { emailId, error });
          }
        }

        const quotedBody = originalEmail?.bodyHtml || originalEmail?.bodyText || '';
        const quotedDate = originalEmail?.receivedAt ? new Date(originalEmail.receivedAt).toLocaleString() : '';
        const quotedFrom = originalEmail?.from || '';
        const quoteHeader = t.email.composer.replyQuotedHeader
          .replace('{date}', quotedDate)
          .replace('{from}', quotedFrom);
        const formattedQuote = quotedBody
          ? `<br/><br/><blockquote style="border-left: 2px solid #ccc; padding-left: 10px; margin-left: 0; color: #666;">
              <p>${quoteHeader}</p>
              ${quotedBody}
            </blockquote>`
          : '';

        setComposeMode('reply');
        setComposePrefill({
          originalEmailId: emailId,
          to: to ? [String(to)] : undefined,
          subject: subject ? String(subject) : undefined,
          body: formattedQuote,
          inReplyTo: originalEmail?.externalId || undefined,
          references: originalEmail?.references || originalEmail?.externalId || undefined,
        });
      } else if (compose === 'forward' && forward) {
        const emailId = String(forward);

        let originalEmail = storeApi.emails.find((e) => e.id === emailId);
        if (!originalEmail) {
          try {
            const response = await emailApi.getEmail(emailId);
            originalEmail = mapApiEmailToStore(response.data as unknown as ApiEmail);
            storeApi.updateEmail(emailId, originalEmail);
          } catch (error) {
            logger.error('[Mailbox] Failed to fetch email for forward prefill', { emailId, error });
          }
        }

        const forwardBody = originalEmail?.bodyHtml || originalEmail?.bodyText || '';
        const forwardedDate = originalEmail?.receivedAt ? new Date(originalEmail.receivedAt).toLocaleString() : '';
        const forwardedHeader = t.email.composer.forwardedMessageHeader;
        const forwardFromLabel = t.email.composer.from;
        const forwardDateLabel = t.email.view.date;
        const forwardSubjectLabel = t.email.composer.subject;
        const forwardToLabel = t.email.view.to;
        const formattedForward = forwardBody
          ? `<br/><br/>${forwardedHeader}<br/>
              ${forwardFromLabel}: ${originalEmail?.from || ''}<br/>
              ${forwardDateLabel}: ${forwardedDate}<br/>
              ${forwardSubjectLabel}: ${originalEmail?.subject || ''}<br/>
              ${forwardToLabel}: ${originalEmail?.to?.join(', ') || ''}<br/><br/>
              ${forwardBody}`
          : '';

        setComposeMode('forward');
        setComposePrefill({
          originalEmailId: emailId,
          subject: subject ? String(subject) : undefined,
          body: formattedForward,
        });
      } else {
        setComposeMode('compose');
        setComposePrefill(null);
      }

      setComposeOpen(true);
      // Clear the compose query params to avoid reopening on refresh
      router.replace({ pathname: router.pathname, query: {} }, undefined, { shallow: true });
    };

    void openFromQuery();
  }, [router, router.query, t]);

  const getEmptyState = useCallback(() => {
    if (!selectedFolderId) {
      return { title: localText.empty.defaultTitle, subtitle: localText.empty.defaultSubtitle };
    }

    // Check smart filters and aggregators first (by ID pattern)
    if (selectedFolderId.startsWith('smart:unread')) {
      return { title: localText.empty.unreadTitle, subtitle: localText.empty.unreadSubtitle };
    }
    if (selectedFolderId.startsWith('label:')) {
      return { title: localText.empty.labelTitle, subtitle: localText.empty.labelSubtitle };
    }
    if (selectedFolderId === 'all:inbox') {
      return { title: localText.empty.defaultTitle, subtitle: localText.empty.defaultSubtitle };
    }

    // Look up folder in foldersByProvider to get its specialUse
    let specialUse: string | undefined;
    for (const folders of Object.values(foldersByProvider)) {
      const folder = folders.find(f => f.id === selectedFolderId);
      if (folder?.specialUse) {
        specialUse = folder.specialUse.toUpperCase();
        break;
      }
    }

    if (specialUse === 'TRASH') {
      return { title: localText.empty.trashTitle, subtitle: localText.empty.trashSubtitle };
    }
    if (specialUse === 'SENT') {
      return { title: localText.empty.sentTitle, subtitle: localText.empty.sentSubtitle };
    }
    return { title: localText.empty.defaultTitle, subtitle: localText.empty.defaultSubtitle };
  }, [selectedFolderId, localText, foldersByProvider]);

  const handleSyncProviders = useCallback(async () => {
    if (!providers || providers.length === 0) return;
    setSyncLoading(true);
    try {
      await Promise.all(providers.map((p) => emailApi.syncProvider(p.id)));
      setSyncStatusMessage(t.email.messages.syncTriggered);
      queryClient.invalidateQueries({ queryKey: emailKeys.stats() });
      queryClient.invalidateQueries({ queryKey: emailKeys.syncStatus() });
      queryClient.invalidateQueries({ queryKey: emailKeys.lists() });
      queryClient.invalidateQueries({ queryKey: emailKeys.conversations() });
    } catch {
      setSyncStatusMessage(t.email.messages.syncFailed);
    } finally {
      setSyncLoading(false);
    }
  }, [providers, queryClient, t.email.messages.syncFailed, t.email.messages.syncTriggered]);

  // Mobile sidebar state
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Label manager state
  const [labelManagerOpen, setLabelManagerOpen] = useState(false);
  const [labelSelectorOpen, setLabelSelectorOpen] = useState(false);
  const [folderSelectorOpen, setFolderSelectorOpen] = useState(false);

  // Custom hooks
  const {
    handleDelete,
    handleBulkDelete: handleBulkDeleteEmails,
    handleMarkAsRead,
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

  // Handle email click - supports both Email and Conversation types
  const handleEmailClick = useCallback(async (thread: Email | Conversation) => {
    if ('providerId' in thread) {
      // Direct Email object - use original handler
      useEmailStore.getState().updateEmail(thread.id, thread);
      handleEmailClickOriginal(thread as Email);
    } else if ('latestEmailId' in thread && thread.latestEmailId) {
      // Conversation object - fetch the latest email and display it
      try {
        const response = await emailApi.getEmail(thread.latestEmailId);
        const email = mapApiEmailToStore(response.data as unknown as ApiEmail);
        useEmailStore.getState().updateEmail(email.id, email);
        handleEmailClickOriginal(email);
      } catch (error) {
        logger.error('Failed to open conversation email', { error });
        setSnackbar({
          open: true,
          message: t.email.messages.failedToOpenEmail,
          severity: 'error',
        });
      }
    }
  }, [handleEmailClickOriginal, setSnackbar, t.email.messages.failedToOpenEmail]);



  // Smart Filters for quick access
  // Use extracted folder logic
  const {
    smartFilters,
    combinedFolders,
    folderGroups,
    getProviderIcon
  } = useFolderLogic({
    emailStats,
    providers
  });

  // Load folder metadata
  const loadFolderMetadata = useCallback(async () => {
    try {
      setFoldersLoading(true);
      const folderResponse = await getFolders();
      setFoldersData(folderResponse.providers, folderResponse.foldersByProvider);
      // Note: Provider from folders API is a subset of ProviderConfig - safe cast for display purposes
      setProviders(folderResponse.providers);
      setFoldersLoading(false);
    } catch (error) {
      logger.error('Failed to load folders', { error });
      setFoldersLoading(false);
    }
  }, [setFoldersData]);

  const activeFolder = useMemo<FolderItem | null>(() => {
    if (selectedFolderId) {
      return combinedFolders.find((folder) => folder.id === selectedFolderId) ?? combinedFolders[0] ?? null;
    }
    return combinedFolders[0] ?? null;
  }, [combinedFolders, selectedFolderId]);

  const labelFolderId = useMemo(() => {
    if (!activeFolder) return undefined;
    return activeFolder.id.startsWith('label:') ? activeFolder.id.replace('label:', '') : undefined;
  }, [activeFolder]);

  // Determine view mode: email list (flat) or conversation (threaded)
  // Priority: 1) Filters/labels always force list view, 2) User preference if no filters
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
      activeFolder.queryOverrides?.hasAttachments !== undefined ||
      activeFolder.queryOverrides?.startDate !== undefined ||
      activeFolder.queryOverrides?.endDate !== undefined,
    );

    // Filters active = must use email list view
    if (hasActiveFilters) return true;

    // No filters - use user preference (default: conversation view = true)
    return forceConversationView === false; // Only return true (list view) if user explicitly disabled conversation
  }, [activeFolder, advancedFilters, forceConversationView, labelFolderId, searchQuery]);

  // Computed state for UI
  const isConversationView = !useEmailListView;

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
    };
  }, [activeFolder, advancedFilters, labelFolderId, searchQuery]);

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

  const emailsQuery = useInfiniteEmails(emailListParams, {
    enabled: Boolean(activeFolder) && useEmailListView,
  });

  const conversationsQuery = useInfiniteConversations(conversationParams, {
    enabled: Boolean(activeFolder) && !useEmailListView,
  });

  const emailThreads = useMemo(
    () => emailsQuery.data?.pages.flatMap((page) => page.emails) ?? [],
    [emailsQuery.data],
  );

  const conversationThreads = useMemo(
    () => conversationsQuery.data?.pages.flatMap((page) => page.conversations) ?? [],
    [conversationsQuery.data],
  );

  const threads = useMemo<(Email | Conversation)[]>(() => {
    if (useEmailListView) {
      return emailThreads.map((e) => mapApiEmailToStore(e as unknown as ApiEmail));
    }
    return conversationThreads;
  }, [conversationThreads, emailThreads, useEmailListView]);

  const listLoading = useEmailListView
    ? emailsQuery.isPending || emailsQuery.isFetchingNextPage
    : conversationsQuery.isPending || conversationsQuery.isFetchingNextPage;

  const hasMoreItems = useEmailListView ? Boolean(emailsQuery.hasNextPage) : Boolean(conversationsQuery.hasNextPage);

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


  // Handle label changes - backend always returns updated email
  const handleLabelsChange = useCallback(async (emailId: string, labelIds: string[], updatedEmail?: Email) => {
    if (!updatedEmail) {
      logger.warn('[Mailbox] No updated email provided - this should not happen');
      return;
    }

    logger.debug('[Mailbox] handleLabelsChange', { emailId, labelIds });

    // Keep selected email in sync immediately
    if (storeSelectedEmail?.id === emailId) {
      setSelectedEmail(updatedEmail);
    }

    // Store cache for compose/reply prefill and keyboard actions
    useEmailStore.getState().updateEmail(emailId, updatedEmail);

    // Ensure list/detail reflect the new labels
    queryClient.invalidateQueries({ queryKey: emailKeys.detail(emailId) });
    queryClient.invalidateQueries({ queryKey: emailKeys.lists() });
    queryClient.invalidateQueries({ queryKey: emailKeys.conversations() });
    queryClient.invalidateQueries({ queryKey: emailKeys.stats() });

    const threadKey = updatedEmail.threadId || emailId;
    queryClient.invalidateQueries({ queryKey: emailKeys.thread(threadKey) });

    setSnackbar({
      open: true,
      message: t.email.messages.labelsUpdated,
      severity: 'success',
    });
  }, [queryClient, setSelectedEmail, storeSelectedEmail, t]);

  // Refresh emails
  const handleRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: emailKeys.lists() });
    queryClient.invalidateQueries({ queryKey: emailKeys.conversations() });
    queryClient.invalidateQueries({ queryKey: emailKeys.stats() });
  }, [queryClient]);



  // Use extracted selection logic (Bulk Actions)
  const {
    handleSelectAll,
    handleBulkMarkRead,
    handleBulkMarkUnread,
    handleBulkStar,
    handleBulkUnstar,
    handleBulkFlag,
    handleBulkUnflag,
    handleBulkDelete,
    handleBulkArchive: handleBulkArchiveLocal,
    handleBulkAddLabels,
    handleBulkMoveToFolder,
    selectedIds,
    getThreadKey,
    resolveEmailIdsForThread
  } = useSelectionLogic({
    threads,
    onSuccess: (message: string) => setSnackbar({ open: true, message, severity: 'success' }),
    onError: (message: string) => setSnackbar({ open: true, message, severity: 'error' }),
    handleMarkAsRead,
    handleArchive,
    handleBulkDeleteEmails,
  });

  // Handle drag start - track which email is being dragged
  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { active } = event;
    const dragData = active.data.current;

    if (dragData?.type === 'email') {
      const thread = dragData.email as Email | Conversation;
      setDraggedEmail(thread);
      setIsDraggingEmail(true);
      logger.debug('[Mailbox] Drag started', { emailId: dragData.emailId, threadId: dragData.threadId });
    }
  }, []);

  // Handle drag end - move email to folder if dropped on valid target
  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;

    // Reset drag state
    setDraggedEmail(null);
    setIsDraggingEmail(false);

    // Check if dropped on a valid folder
    if (!over || !active.data.current) {
      return;
    }

    const dragData = active.data.current;
    const dropData = over.data.current;

    // Only handle email-to-folder drops
    if (dragData.type !== 'email' || dropData?.type !== 'folder') {
      return;
    }

    const targetFolder = dropData.folder as FolderItem;
    const targetFolderName = targetFolder.filterFolder || targetFolder.label;

    if (dragData.isSelected && selectedIds.size > 0) {
      // Bulk move
      await handleBulkMoveToFolder(targetFolderName);
    } else {
      // Single move
      const droppedThread = dragData.email as Email | Conversation;
      const emailIdsToMove = await resolveEmailIdsForThread(droppedThread);

      if (emailIdsToMove.length === 0) return;

      try {
        await emailApi.bulkMoveToFolder(emailIdsToMove, targetFolderName);
        queryClient.invalidateQueries({ queryKey: emailKeys.lists() });
        queryClient.invalidateQueries({ queryKey: emailKeys.conversations() });
        queryClient.invalidateQueries({ queryKey: emailKeys.stats() });
        setSnackbar({
          open: true,
          message: t.email.messages.moved
            .replace('{count}', '1')
            .replace('{folder}', targetFolder.label),
          severity: 'success',
        });
      } catch (error) {
        logger.error('[Mailbox] Failed to move emails', { error });
        setSnackbar({
          open: true,
          message: t.email.messages.moveFailed,
          severity: 'error',
        });
      }
    }
  }, [handleBulkMoveToFolder, queryClient, resolveEmailIdsForThread, selectedIds, t.email.messages]);



  // Get drag count for overlay
  const dragCount = useMemo(() => {
    if (!isDraggingEmail) return 1;
    // If the dragged email is selected and there are multiple selections, show count
    const draggedKey = draggedEmail ? getThreadKey(draggedEmail) : '';
    if (draggedKey && selectedIds.has(draggedKey) && selectedIds.size > 1) {
      return selectedIds.size;
    }
    return 1;
  }, [getThreadKey, isDraggingEmail, draggedEmail, selectedIds]);

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

  // Load initial email from URL parameter (e.g., ?id=xxx from dashboard widgets)
  useEffect(() => {
    if (initialEmailId && !storeSelectedEmail) {
      emailApi.getEmail(initialEmailId)
        .then((response) => {
          if (response.data) {
            setSelectedEmail(response.data);
          }
        })
        .catch((error) => {
          logger.error('Failed to load initial email', { error, emailId: initialEmailId });
        });
    }
  }, [initialEmailId, setSelectedEmail, storeSelectedEmail]);

  // Close detail + selection on context changes (folder/filter/search)
  useEffect(() => {
    clearSelection();
    setSelectedEmail(null);
  }, [advancedFilters, clearSelection, selectedFolderId, setSelectedEmail]);

  // Keyboard navigation
  useKeyboardNavigation({
    threads,
    enabled: true,
    onDelete: handleDelete,
    onReply: handleReply,
    onToggleStar: handleToggleStar,
    onThreadClick: handleEmailClick,
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

  // Use extracted compose handlers (Reply, Reply All, Forward)
  const {
    handleReply: handleReplyLocal,
    handleReplyAll: handleReplyAllLocal,
    handleForward: handleForwardLocal
  } = useComposeHandlers({
    setComposeMode,
    setComposePrefill,
    setComposeOpen
  });





  const selectedListId = storeSelectedEmail?.threadId || storeSelectedEmail?.id;
  const emptyBase = getEmptyState();
  const emptyState = {
    ...emptyBase,
    subtitle: `${emptyBase.subtitle} ${t.email.messages.trySyncOrFilter}`.trim(),
  };





  return (
    <DndContext
      sensors={dndSensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <ResizableEmailLayout
        sidebarOpen={mobileSidebarOpen}
        onSidebarClose={() => setMobileSidebarOpen(false)}
        sidebar={
          <EmailSidebar
            folderGroups={folderGroups}
            selectedFolderId={selectedFolderId}
            onFolderSelect={(folderId: string) => {
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
            isEmailDragging={isDraggingEmail}
            onFoldersRefresh={loadFolderMetadata}
          />
        }
        list={
          <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, overflow: 'hidden' }}>
            <MailboxHeader
              isMobile={isMobile}
              setMobileSidebarOpen={setMobileSidebarOpen}
              isConnected={isConnected}
              emailStats={emailStats ?? undefined}
              setAdvancedSearchOpen={setAdvancedSearchOpen}
              isConversationView={isConversationView}
              toggleConversationView={toggleConversationView}
              handleSyncProviders={handleSyncProviders}
              syncLoading={syncLoading}
            />
            {/* Bulk Action Bar */}
            <BulkActionBar
              selectedCount={selectedIds.size}
              totalCount={threads.length}
              onSelectAll={handleSelectAll}
              onClearSelection={clearSelection}
              onMarkRead={handleBulkMarkRead}
              onMarkUnread={handleBulkMarkUnread}
              onDelete={handleBulkDelete}
              onArchive={handleBulkArchiveLocal}
              onStar={handleBulkStar}
              onUnstar={handleBulkUnstar}
              onFlag={handleBulkFlag}
              onUnflag={handleBulkUnflag}
              onAddLabels={() => setLabelSelectorOpen(true)}
              onMoveToFolder={() => setFolderSelectorOpen(true)}
            />

            {/* Render appropriate view based on mode */}
            <Box sx={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
              <ThreadList
                threads={threads}
                selectedId={selectedListId}
                selectedIds={selectedIds}
                isLoading={listLoading}
                onThreadClick={handleEmailClick}
                onToggleSelect={toggleSelection}
                onToggleRead={handleToggleRead}
                onToggleStar={handleToggleStar}
                onToggleImportant={handleToggleImportant}
                onArchive={(id) => handleArchive([id])}
                onDelete={handleDelete}
                getProviderIcon={getProviderIcon}
                onLoadMore={onLoadMoreThreads}
                hasMore={hasMoreItems}
                emptyTitle={emptyState.title}
                emptySubtitle={emptyState.subtitle}
              />
            </Box>
          </Box>
        }
        detail={
          storeSelectedEmail ? (
            <ThreadDisplay
              email={storeSelectedEmail}
              onDelete={(email) => handleDelete(email.id)}
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
        prefillData={composePrefill ?? undefined}
        onClose={() => {
          setComposeOpen(false);
          setComposeMode('compose');
          setComposePrefill(null);
        }}
        onSent={() => {
          setSnackbar({
            open: true,
            message: t.email.messages.emailSent,
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

      {/* Drag overlay for visual feedback */}
      <EmailDragOverlay
        activeEmail={draggedEmail}
        dragCount={dragCount}
      />
    </DndContext>
  );
}
