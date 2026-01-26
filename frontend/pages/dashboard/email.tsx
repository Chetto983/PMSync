import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { Layout } from '@/components/layout/Layout';
import { PageErrorBoundary } from '@/components/common/ErrorBoundary';
import { EmailLayout } from '@/components/email';
import { ThreadList, ThreadListItemData } from '@/components/email/list';
import { ExpandedMessage } from '@/components/email/thread';
import { LabelPickerDialog } from '@/components/email/labels';
import { useToast } from '@/hooks/use-toast';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useKeyboardNavigation } from '@/hooks/use-keyboard-navigation';
import { useQueryClient } from '@tanstack/react-query';
import {
  useEmail,
  useFolders,
  useBulkMoveEmails,
  useBulkMarkRead,
  useBulkDeleteEmails,
  useUpdateEmail,
  useDeleteEmail,
  useSenderPhotos,
  useUserPreferences,
  useUpdatePreferences,
  emailsListOptions,
} from '@/hooks/queries';
import type { SenderContactMap } from '@/lib/api/contacts';
import { useEmailRealtime } from '@/hooks/use-email-realtime';
import { useEmailFilters } from '@/stores/email-ui-store';
import { useEmailListStore } from '@/stores/email-list-store';
import { CircularProgress, Box, Typography, useMediaQuery, useTheme, Fab, Tooltip } from '@mui/material';
import { Pencil } from 'lucide-react';
import { apiClient } from '@/lib/api';
import type { Email } from '@/lib/api/emails';
import { getAvatarUrl } from '@/lib/utils/gravatar';

/**
 * Email Page
 *
 * Phase 3: Email list with virtual scrolling and drag-and-drop
 * Displays inbox with 3-line layout (sender/subject/snippet)
 * Supports moving emails between folders with provider validation
 */

/**
 * Extract email address from "Name <email@domain.com>" format
 */
function extractEmailAddress(from: string): string {
  const match = from.match(/<([^>]+)>/);
  if (match) return match[1].toLowerCase();
  // If no brackets, treat the whole string as email
  return from.toLowerCase().trim();
}

// Helper to format email data from API to ThreadListItemData
function formatEmailToThread(email: Email, senderPhotos?: SenderContactMap): ThreadListItemData {
  const senderEmail = extractEmailAddress(email.from);
  const senderInfo = senderPhotos?.[senderEmail];
  // Known contact = found in senderPhotos (even if no photo)
  const isKnownContact = !!senderInfo;

  return {
    id: email.id,
    from: email.from,
    subject: email.subject || '(No subject)',
    snippet: email.snippet || '',
    date: new Date(email.receivedAt).toLocaleDateString(),
    isUnread: !email.isRead,
    isFlagged: email.isFlagged || email.isStarred,
    hasAttachments: (email.attachments?.length ?? 0) > 0,
    providerId: email.providerId, // Provider ID for drag-and-drop validation
    avatarUrl: getAvatarUrl(senderEmail, senderInfo?.photoUrl, isKnownContact), // Contact photo > initials > Gravatar
    // Map emailLabels to the format expected by ThreadListItem
    // Backend returns el.label.id, not el.labelId
    labels: email.emailLabels?.map((el) => ({
      id: el.label?.id || '',
      name: el.label?.name || 'Label',
      color: el.label?.color?.backgroundColor || '#9E9E9E',
    })).filter((l) => l.id),
  };
}

export default function EmailPage() {
  const router = useRouter();
  const toast = useToast();
  const t = useTranslations();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const isTablet = useMediaQuery(theme.breakpoints.down('md'));
  const isDesktop = !isMobile && !isTablet;

  // Selected email ID for 3-panel view (desktop only)
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);

  // Label picker dialog state
  const [labelPickerOpen, setLabelPickerOpen] = useState(false);
  const [labelPickerEmailIds, setLabelPickerEmailIds] = useState<string[]>([]);

  // Store state (following Contacts pattern)
  const {
    emails: storeEmails,
    setEmails: setStoreEmails,
    appendEmails,
    isLoading: loading,
    setLoading,
    isLoadingMore: loadingMore,
    setLoadingMore,
    pagination,
    setPagination,
    reset: resetStore,
  } = useEmailListStore();

  // TanStack Query client for imperative fetching
  const queryClient = useQueryClient();

  // Refs for pagination (following Contacts pattern)
  const paginationRef = useRef({ page: 1, pageSize: 50, hasMore: true, total: 0 });

  // Navigate to compose page
  const handleCompose = useCallback(() => {
    router.push('/dashboard/email/compose');
  }, [router]);

  // Handle ?id= query param from dashboard widgets (open specific email)
  useEffect(() => {
    const emailId = router.query.id as string;
    if (emailId) {
      if (isDesktop) {
        setSelectedThreadId(emailId);
      } else {
        router.replace(`/dashboard/email/thread/${emailId}`);
      }
      // Clear the query param to avoid re-triggering
      router.replace('/dashboard/email', undefined, { shallow: true });
    }
  }, [router.query.id, isDesktop, router]);

  // Get folder filters from store (sidebar sets these)
  const filters = useEmailFilters();

  const { data: foldersData } = useFolders();

  const selectedFolderPath = useMemo(() => {
    if (!filters.folderId || !filters.providerId) return undefined;
    const providerFolders = foldersData?.foldersByProvider?.[filters.providerId] || [];
    const selected = providerFolders.find((folder) => folder.id === filters.folderId);
    return selected?.path || selected?.name;
  }, [filters.folderId, filters.providerId, foldersData?.foldersByProvider]);

  // Enable realtime updates via WebSocket
  useEmailRealtime({
    folder: selectedFolderPath || filters.specialUse || 'INBOX',
    enabled: true,
  });

  // Map special folder to API-supported values
  const getApiSpecialUse = useCallback(
    (folder?: string): 'INBOX' | 'SENT' | 'DRAFTS' | 'TRASH' | 'SPAM' | 'ARCHIVE' | undefined => {
      const supported = ['INBOX', 'SENT', 'DRAFTS', 'TRASH', 'SPAM', 'ARCHIVE'];
      if (folder && supported.includes(folder)) {
        return folder as 'INBOX' | 'SENT' | 'DRAFTS' | 'TRASH' | 'SPAM' | 'ARCHIVE';
      }
      return undefined;
    },
    []
  );

  // Build query params for emails API
  const emailQueryParams = useMemo(() => ({
    specialUse: filters.labelId || filters.folderId
      ? undefined
      : getApiSpecialUse(filters.specialUse),
    providerId: filters.providerId,
    folder: selectedFolderPath,
    isRead: filters.isRead,
    isImportant: filters.isImportant,
    hasAttachments: filters.hasAttachments,
    search: filters.search,
    labelIds: filters.labelId,
    fromVip: filters.fromVip,
    limit: 50,
  }), [filters, selectedFolderPath, getApiSpecialUse]);

  // Create a stable filter key to detect filter changes
  const filterKey = useMemo(() => JSON.stringify(emailQueryParams), [emailQueryParams]);

  // Sync refs with state (following Contacts pattern)
  useEffect(() => {
    paginationRef.current = pagination;
  }, [pagination]);

  // Load emails using TanStack Query (following Contacts pattern)
  const loadEmails = useCallback(async (reset: boolean = true) => {
    try {
      if (reset) {
        setLoading(true);
        const newPagination = { page: 1, pageSize: 50, hasMore: true, total: 0 };
        paginationRef.current = newPagination;
        setPagination(newPagination);
      } else {
        setLoadingMore(true);
      }

      const page = reset ? 1 : paginationRef.current.page + 1;
      const response = await queryClient.fetchQuery(
        emailsListOptions({ ...emailQueryParams, page })
      );
      const emailsData = response?.emails || [];

      if (reset) {
        setStoreEmails(emailsData);
      } else {
        // Append emails using store's getState for current data
        const currentEmails = useEmailListStore.getState().emails;
        const existingIds = new Set(currentEmails.map((e) => e.id));
        const newEmails = emailsData.filter((e: Email) => !existingIds.has(e.id));
        appendEmails(newEmails);
      }

      const responsePagination = response?.pagination;
      const newPagination = {
        page,
        pageSize: 50,
        hasMore: responsePagination ? responsePagination.page < responsePagination.totalPages : false,
        total: responsePagination?.total || 0,
      };
      paginationRef.current = newPagination;
      setPagination(newPagination);
    } catch {
      // Failed to load emails - silently fail
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [emailQueryParams, setStoreEmails, appendEmails, setPagination, setLoading, setLoadingMore, queryClient]);

  // Reset and reload when filters change
  useEffect(() => {
    resetStore();
    loadEmails(true);
  }, [filterKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load more emails (infinite scroll)
  const handleLoadMore = useCallback(() => {
    if (!loadingMore && pagination.hasMore) {
      loadEmails(false);
    }
  }, [loadEmails, loadingMore, pagination.hasMore]);

  // Fetch single email when selected (desktop 3-panel view)
  const { data: selectedEmail, isLoading: isEmailLoading } = useEmail(selectedThreadId || '');

  // Mutations for email operations
  const moveEmails = useBulkMoveEmails();
  const markRead = useBulkMarkRead();
  const bulkDelete = useBulkDeleteEmails();
  const updateEmail = useUpdateEmail();
  const deleteEmail = useDeleteEmail();

  // Preferences for folder reordering
  const { data: preferences } = useUserPreferences();
  const updatePreferences = useUpdatePreferences();

  // Extract unique sender emails for photo lookup (from store emails)
  const senderEmails = useMemo(() => {
    if (!storeEmails.length) return [];
    const emails = storeEmails.map((e) => extractEmailAddress(e.from));
    return [...new Set(emails)];
  }, [storeEmails]);

  // Fetch sender photos from contacts (batch lookup)
  const { data: senderPhotos } = useSenderPhotos(senderEmails);

  // Format emails to thread list format with sender photos (from store emails)
  const threads = useMemo(
    () => storeEmails.map((email) => formatEmailToThread(email, senderPhotos)),
    [storeEmails, senderPhotos]
  );

  // Email click - mark as read and show in reading pane (single email, not thread)
  const handleThreadClick = useCallback(
    async (id: string) => {
      // Find the email from store emails
      const email = storeEmails.find((e) => e.id === id);
      if (!email) return;

      // Mark as read if unread
      if (!email.isRead) {
        try {
          await updateEmail.mutateAsync({
            emailId: id,
            dto: { isRead: true },
          });
        } catch {
          // Silent fail - don't block UI for read status
        }
      }

      if (isDesktop) {
        // Desktop: show single email in reading pane (not thread view)
        setSelectedThreadId(id); // Use email ID
      } else {
        // Mobile/Tablet: navigate to thread detail page
        router.push(`/dashboard/email/thread/${id}`);
      }
    },
    [router, storeEmails, isDesktop, updateEmail]
  );

  // Close reading pane
  const handleCloseReadingPane = useCallback(() => {
    setSelectedThreadId(null);
  }, []);

  // Keyboard navigation (Phase 9): j/k to navigate, Enter to open, Escape to close, c to compose
  const { focusedId } = useKeyboardNavigation({
    items: threads,
    getItemId: (thread) => thread.id,
    onOpen: handleThreadClick,
    onEscape: handleCloseReadingPane,
    onCompose: handleCompose,
    enabled: !loading && threads.length > 0,
    isReadingPaneOpen: !!selectedThreadId && isDesktop,
  });

  // Format single email for ExpandedMessage component
  const selectedEmailData = useMemo(() => {
    if (!selectedEmail) return null;
    // Get avatar URL using same logic as thread list
    const senderEmail = extractEmailAddress(selectedEmail.from);
    const senderInfo = senderPhotos?.[senderEmail];
    const isKnownContact = !!senderInfo;

    return {
      id: selectedEmail.id,
      from: selectedEmail.from,
      to: selectedEmail.to || [],
      cc: selectedEmail.cc,
      date: new Date(selectedEmail.receivedAt).toLocaleDateString(),
      subject: selectedEmail.subject || '',
      body: selectedEmail.bodyHtml || selectedEmail.bodyText || '',
      isUnread: !selectedEmail.isRead,
      isFlagged: selectedEmail.isFlagged || selectedEmail.isStarred || false,
      hasAttachments: (selectedEmail.attachments?.length ?? 0) > 0,
      attachments: selectedEmail.attachments?.map((att) => ({
        id: att.id,
        name: att.filename,
        size: att.size,
        contentId: att.contentId,
      })),
      avatarUrl: getAvatarUrl(senderEmail, senderInfo?.photoUrl, isKnownContact),
      // AI Triage fields - show if already analyzed
      aiPriority: selectedEmail.aiPriority ?? null,
      aiPriorityReason: selectedEmail.aiPriorityReason ?? null,
      aiLabels: selectedEmail.aiLabels ?? null,
    };
  }, [selectedEmail, senderPhotos]);

  // Thread action handlers
  const handleReply = useCallback((messageId: string) => {
    router.push(`/dashboard/email/compose?mode=reply&emailId=${messageId}`);
  }, [router]);

  const handleReplyAll = useCallback((messageId: string) => {
    router.push(`/dashboard/email/compose?mode=replyAll&emailId=${messageId}`);
  }, [router]);

  const handleForward = useCallback((messageId: string) => {
    router.push(`/dashboard/email/compose?mode=forward&emailId=${messageId}`);
  }, [router]);

  const handleFlagMessage = useCallback(async (messageId: string) => {
    if (!selectedEmailData || selectedEmailData.id !== messageId) return;
    try {
      await updateEmail.mutateAsync({
        emailId: messageId,
        dto: { isFlagged: !selectedEmailData.isFlagged },
      });
    } catch {
      toast.error(t.common.genericError);
    }
  }, [selectedEmailData, updateEmail, toast, t]);

  // Handle adding labels to a single message
  const handleLabelsMessage = useCallback((messageId: string) => {
    setLabelPickerEmailIds([messageId]);
    setLabelPickerOpen(true);
  }, []);

  // Delete single message from reading pane
  const handleDeleteMessage = useCallback(async (messageId: string) => {
    try {
      await deleteEmail.mutateAsync(messageId);
      toast.success(t.common.success ?? 'Deleted');
      setSelectedThreadId(null); // Close reading pane
    } catch {
      toast.error(t.common.genericError);
    }
  }, [deleteEmail, toast, t]);

  // Archive single message from reading pane
  const handleArchiveMessage = useCallback(async (messageId: string) => {
    try {
      await moveEmails.mutateAsync({ emailIds: [messageId], targetFolder: 'ARCHIVE' });
      toast.success(t.common.success ?? 'Archived');
      setSelectedThreadId(null); // Close reading pane
    } catch {
      toast.error(t.common.genericError);
    }
  }, [moveEmails, toast, t]);

  // Move single message from reading pane (opens folder picker)
  const handleMoveMessage = useCallback((messageId: string) => {
    // For now, use bulk move handler with single email
    toast.info(t.threadActions?.folderPickerComingSoon || 'Folder picker coming soon');
    void messageId; // Will be used when folder picker is implemented
  }, [toast, t]);

  // Download attachment
  const handleDownloadAttachment = useCallback(async (_messageId: string, attachmentId: string) => {
    try {
      // Use direct API client (axios) to get blob with auth headers
      const response = await apiClient.get<Blob>(`/email/attachments/${attachmentId}/download`, {
        responseType: 'blob',
      });

      if (response.status !== 200) {
        throw new Error(`Download failed with status: ${response.status}`);
      }

      const blob = response.data;

      // Create download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;

      // Attempt to get filename from content-disposition
      const disposition = response.headers['content-disposition'];
      let filename = 'attachment';
      if (disposition && disposition.indexOf('attachment') !== -1) {
        // Simple regex for filename*=UTF-8''... or filename="..."
        const matches = /filename\*=UTF-8''([^;]+)|filename="?([^"]+)"?/.exec(disposition);
        if (matches) {
          filename = decodeURIComponent(matches[1] || matches[2]);
        }
      }

      // Fallback to known filename from metadata if header parsing fails or isn't present
      if (filename === 'attachment' && selectedEmailData) {
        const att = selectedEmailData.attachments?.find(a => a.id === attachmentId);
        if (att) filename = att.name;
      }

      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();

      // Cleanup
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Download failed', error);
      toast.error(t.common.genericError || 'Download failed');
    }
  }, [selectedEmailData, toast, t]);

  // Reading pane component for 3-panel desktop view (single email, not thread)
  const readingPane = useMemo(() => {
    if (!selectedThreadId || !isDesktop) return undefined;

    // Show loading state while fetching email
    if (isEmailLoading) {
      return (
        <Box
          data-testid="reading-pane"
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            gap: 2,
          }}
        >
          <CircularProgress size={32} />
          <Typography variant="body2" color="text.secondary">
            {t.threadView?.loading || 'Loading email...'}
          </Typography>
        </Box>
      );
    }

    // Show single email view
    if (!selectedEmailData) return undefined;

    return (
      <Box data-testid="reading-pane" sx={{ height: '100%', overflow: 'auto', p: 2 }}>
        <ExpandedMessage
          message={selectedEmailData}
          onCollapse={handleCloseReadingPane}
          onReply={handleReply}
          onReplyAll={handleReplyAll}
          onForward={handleForward}
          onFlag={handleFlagMessage}
          onLabels={handleLabelsMessage}
          onDownloadAttachment={handleDownloadAttachment}
          onDelete={handleDeleteMessage}
          onArchive={handleArchiveMessage}
          onMove={handleMoveMessage}
        />
      </Box>
    );
  }, [
    selectedThreadId,
    isDesktop,
    isEmailLoading,
    selectedEmailData,
    handleCloseReadingPane,
    handleReply,
    handleReplyAll,
    handleForward,
    handleFlagMessage,
    handleLabelsMessage,
    handleDownloadAttachment,
    handleDeleteMessage,
    handleArchiveMessage,
    handleMoveMessage,
    t.threadView?.loading,
  ]);

  // Refresh emails - reset and reload
  const handleRefresh = useCallback(() => {
    loadEmails(true);
  }, [loadEmails]);

  // Bulk mark as read
  const handleBulkMarkAsRead = useCallback(
    async (ids: string[]) => {
      try {
        await markRead.mutateAsync({ emailIds: ids, isRead: true });
        toast.success(t.common.success ?? 'Done');
      } catch {
        toast.error(t.common.genericError);
      }
    },
    [markRead, toast, t]
  );

  // Bulk mark as unread
  const handleBulkMarkAsUnread = useCallback(
    async (ids: string[]) => {
      try {
        await markRead.mutateAsync({ emailIds: ids, isRead: false });
        toast.success(t.common.success ?? 'Done');
      } catch {
        toast.error(t.common.genericError);
      }
    },
    [markRead, toast, t]
  );

  // Bulk archive - moves to Archive folder
  const handleBulkArchive = useCallback(
    async (ids: string[]) => {
      try {
        await moveEmails.mutateAsync({ emailIds: ids, targetFolder: 'ARCHIVE' });
        toast.success(t.common.success ?? 'Done');
      } catch {
        toast.error(t.common.genericError);
      }
    },
    [moveEmails, toast, t]
  );

  // Bulk delete
  const handleBulkDelete = useCallback(
    async (ids: string[]) => {
      try {
        await bulkDelete.mutateAsync(ids);
        toast.success(t.common.success ?? 'Done');
      } catch {
        toast.error(t.common.genericError);
      }
    },
    [bulkDelete, toast, t]
  );

  // Bulk move - show folder picker (TODO: implement picker dialog)
  const handleBulkMove = useCallback((_ids: string[]) => {
    // TODO: Show folder picker dialog (implement in Phase 4.3)
    toast.info(t.threadActions?.folderPickerComingSoon || 'Folder picker coming soon');
  }, [toast, t]);

  // Get current label IDs for selected emails (intersection of all labels)
  // Note: Backend returns emailLabels: [{ label: { id, name, color } }]
  // So we access el.label?.id, not el.labelId
  const getCurrentLabelIds = useCallback(
    (ids: string[]): string[] => {
      // Helper to extract label IDs from emailLabels array
      const extractLabelIds = (emailLabels?: { label?: { id: string } }[]): string[] =>
        emailLabels?.map((el) => el.label?.id).filter((id): id is string => !!id) || [];

      // For single email, check selectedEmail first (from reading pane)
      if (ids.length === 1 && selectedEmail && selectedEmail.id === ids[0]) {
        return extractLabelIds(selectedEmail.emailLabels);
      }

      // Fall back to store data
      const selectedEmails = storeEmails.filter((e) => ids.includes(e.id));
      if (selectedEmails.length === 0) return [];

      // Get label IDs from first email
      const firstEmailLabels = new Set(extractLabelIds(selectedEmails[0].emailLabels));

      // For single email, return all its labels
      if (selectedEmails.length === 1) {
        return Array.from(firstEmailLabels);
      }

      // For multiple emails, return intersection (labels common to all)
      for (let i = 1; i < selectedEmails.length; i++) {
        const emailLabels = new Set(extractLabelIds(selectedEmails[i].emailLabels));
        firstEmailLabels.forEach((labelId) => {
          if (!emailLabels.has(labelId)) {
            firstEmailLabels.delete(labelId);
          }
        });
      }
      return Array.from(firstEmailLabels);
    },
    [storeEmails, selectedEmail]
  );

  // Bulk label - show label picker dialog
  const handleBulkLabel = useCallback((ids: string[]) => {
    setLabelPickerEmailIds(ids);
    setLabelPickerOpen(true);
  }, []);

  // Handle label picker success
  const handleLabelPickerSuccess = useCallback(() => {
    toast.success(t.common.success ?? 'Labels added');
    setLabelPickerOpen(false);
    setLabelPickerEmailIds([]);
  }, [toast, t]);

  // Close label picker
  const handleLabelPickerClose = useCallback(() => {
    setLabelPickerOpen(false);
    setLabelPickerEmailIds([]);
  }, []);

  // Toggle flag on single email
  const handleFlag = useCallback(
    async (id: string) => {
      const email = threads.find((t) => t.id === id);
      if (!email) return;

      try {
        await updateEmail.mutateAsync({
          emailId: id,
          dto: { isFlagged: !email.isFlagged },
        });
      } catch {
        toast.error(t.common.genericError);
      }
    },
    [threads, updateEmail, toast, t]
  );

  // Archive single email
  const handleArchive = useCallback(
    async (id: string) => {
      try {
        await moveEmails.mutateAsync({ emailIds: [id], targetFolder: 'ARCHIVE' });
        toast.success(t.common.success ?? 'Done');
      } catch {
        toast.error(t.common.genericError);
      }
    },
    [moveEmails, toast, t]
  );

  // Delete single email
  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await deleteEmail.mutateAsync(id);
        toast.success(t.common.success ?? 'Done');
      } catch {
        toast.error(t.common.genericError);
      }
    },
    [deleteEmail, toast, t]
  );

  // Drag and drop handler with provider validation
  const handleEmailDrop = async (emailIds: string[], folderId: string, folderName: string) => {
    // Find the email(s) being moved
    const emails = threads.filter((t) => emailIds.includes(t.id));

    if (emails.length === 0) return;

    // Get provider ID from first email
    const emailProviderId = emails[0].providerId;

    if (!emailProviderId) {
      toast.error(t.errors?.missingProviderInfo || 'Email provider information is missing');
      return;
    }

    // NOTE: Provider validation is done in ThreadList component via DnD collision detection
    // Additional validation can be added here if needed

    try {
      // Call the real API to move emails
      await moveEmails.mutateAsync({
        emailIds,
        targetFolder: folderId,
      });

      // Success! Show toast notification
      const message =
        emailIds.length === 1
          ? t.emailList.emailMoved.replace('{folder}', folderName)
          : t.emailList.emailsMoved
            .replace('{count}', emailIds.length.toString())
            .replace('{folder}', folderName);

      toast.success(message);
    } catch {
      // Error handling - failed to move emails
      toast.error(t.errors?.moveFailed || 'Failed to move email(s). Please try again.');
    }
  };

  // Folder reorder handler (for drag-drop folder sorting)
  const handleFolderReorder = useCallback(
    (providerId: string, activeId: string, overId: string) => {
      // Get current folder order for this provider
      const providerFolders = foldersData?.foldersByProvider?.[providerId] || [];
      const currentOrder = preferences?.folderOrders?.[providerId] || providerFolders.map((f) => f.id);

      const oldIndex = currentOrder.indexOf(activeId);
      const newIndex = currentOrder.indexOf(overId);

      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;

      // Create new order using array move
      const newOrder = [...currentOrder];
      newOrder.splice(oldIndex, 1);
      newOrder.splice(newIndex, 0, activeId);

      // Persist the new order
      updatePreferences.mutate({
        folderOrders: {
          ...(preferences?.folderOrders || {}),
          [providerId]: newOrder,
        },
      });
    },
    [foldersData?.foldersByProvider, preferences?.folderOrders, updatePreferences]
  );

  // Show loading state (only on initial load when no emails yet)
  if (loading && storeEmails.length === 0) {
    return (
      <Layout>
        <EmailLayout>
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 400,
              gap: 2,
            }}
          >
            <CircularProgress size={40} />
            <Typography variant="body2" color="text.secondary">
              Loading emails...
            </Typography>
          </Box>
        </EmailLayout>
      </Layout>
    );
  }

  // Note: Error state is handled by PageErrorBoundary for render errors

  return (
    <PageErrorBoundary pageName="Email">
      <Layout>
        <EmailLayout readingPane={readingPane} onEmailDrop={handleEmailDrop} onFolderReorder={handleFolderReorder}>
          <ThreadList
            threads={threads}
            emptyVariant={filters.search ? 'search' : filters.fromVip ? 'vip' : 'inbox'}
            isLoading={loading}
            isLoadingMore={loadingMore}
            hasMore={pagination.hasMore}
            focusedId={focusedId}
            onThreadClick={handleThreadClick}
            onRefresh={handleRefresh}
            onLoadMore={handleLoadMore}
            onBulkMarkAsRead={handleBulkMarkAsRead}
            onBulkMarkAsUnread={handleBulkMarkAsUnread}
            onBulkArchive={handleBulkArchive}
            onBulkDelete={handleBulkDelete}
            onBulkMove={handleBulkMove}
            onBulkLabel={handleBulkLabel}
            onFlag={handleFlag}
            onArchive={handleArchive}
            onDelete={handleDelete}
          />
          <toast.ToastContainer />
        </EmailLayout>

        {/* Label Picker Dialog */}
        <LabelPickerDialog
          open={labelPickerOpen}
          onClose={handleLabelPickerClose}
          emailIds={labelPickerEmailIds}
          currentLabelIds={getCurrentLabelIds(labelPickerEmailIds)}
          onSuccess={handleLabelPickerSuccess}
        />

        {/* Compose FAB - Desktop only (mobile/tablet use MobileEmailNav FAB) */}
        <Tooltip title={`${t.email?.composer?.title || 'Compose'} (C)`} placement="left">
          <Fab
            color="primary"
            aria-label="compose"
            onClick={handleCompose}
            sx={{
              display: { xs: 'none', md: 'flex' }, // Hidden on mobile/tablet
              position: 'fixed',
              bottom: 24,
              right: 24,
              zIndex: 1200,
            }}
          >
            <Pencil size={24} />
          </Fab>
        </Tooltip>
      </Layout>
    </PageErrorBoundary>
  );
}

export const getServerSideProps = async () => {
  return { props: {} };
};
