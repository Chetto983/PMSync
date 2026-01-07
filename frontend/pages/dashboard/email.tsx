import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useRouter } from 'next/router';
import { Layout } from '@/components/layout/Layout';
import { PageErrorBoundary } from '@/components/common/ErrorBoundary';
import { EmailLayout } from '@/components/email';
import { ThreadList, ThreadListItemData } from '@/components/email/list';
import { ExpandedMessage } from '@/components/email/thread';
import { LabelPickerDialog } from '@/components/email/labels';
import { useToast } from '@/hooks/use-toast';
import { useTranslations } from '@/lib/hooks/use-translations';
import {
  useEmails,
  useEmail,
  useFolders,
  useBulkMoveEmails,
  useBulkMarkRead,
  useBulkDeleteEmails,
  useUpdateEmail,
  useDeleteEmail,
} from '@/hooks/queries';
import { useEmailRealtime } from '@/hooks/use-email-realtime';
import { useEmailFilters } from '@/stores/email-ui-store';
import { CircularProgress, Box, Typography, useMediaQuery, useTheme, Fab, Tooltip } from '@mui/material';
import { Pencil } from 'lucide-react';
import type { Email } from '@/lib/api/emails';

/**
 * Email Page
 *
 * Phase 3: Email list with virtual scrolling and drag-and-drop
 * Displays inbox with 3-line layout (sender/subject/snippet)
 * Supports moving emails between folders with provider validation
 */

// Helper to format email data from API to ThreadListItemData
function formatEmailToThread(email: Email): ThreadListItemData {
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

  // Navigate to compose page
  const handleCompose = useCallback(() => {
    router.push('/dashboard/email/compose');
  }, [router]);

  // Keyboard shortcut: 'C' to compose new email
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if typing in an input field
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }
      // 'C' key to compose
      if (e.key === 'c' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        handleCompose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleCompose]);

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
  const getApiSpecialUse = (
    folder?: string
  ): 'INBOX' | 'SENT' | 'DRAFTS' | 'TRASH' | 'SPAM' | 'ARCHIVE' | undefined => {
    const supported = ['INBOX', 'SENT', 'DRAFTS', 'TRASH', 'SPAM', 'ARCHIVE'];
    if (folder && supported.includes(folder)) {
      return folder as 'INBOX' | 'SENT' | 'DRAFTS' | 'TRASH' | 'SPAM' | 'ARCHIVE';
    }
    return undefined;
  };

  // Fetch email data from API based on current folder filters
  const { data: emailsData, isLoading, refetch } = useEmails({
    specialUse: filters.labelId || filters.folderId
      ? undefined
      : getApiSpecialUse(filters.specialUse), // Avoid overriding folder/label filters
    providerId: filters.providerId,
    folder: selectedFolderPath,
    isRead: filters.isRead,
    isImportant: filters.isImportant,
    hasAttachments: filters.hasAttachments,
    search: filters.search,
    labelIds: filters.labelId, // Filter by label ID
    limit: 50,
  });

  // Fetch single email when selected (desktop 3-panel view)
  const { data: selectedEmail, isLoading: isEmailLoading } = useEmail(selectedThreadId || '');

  // Mutations for email operations
  const moveEmails = useBulkMoveEmails();
  const markRead = useBulkMarkRead();
  const bulkDelete = useBulkDeleteEmails();
  const updateEmail = useUpdateEmail();
  const deleteEmail = useDeleteEmail();

  // Format emails to thread list format (no mock data - real API only)
  const threads = useMemo(
    () => emailsData?.emails?.map(formatEmailToThread) ?? [],
    [emailsData?.emails]
  );

  // Email click - mark as read and show in reading pane (single email, not thread)
  const handleThreadClick = useCallback(
    async (id: string) => {
      // Find the email
      const email = emailsData?.emails?.find((e) => e.id === id);
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
    [router, emailsData?.emails, isDesktop, updateEmail]
  );

  // Close reading pane
  const handleCloseReadingPane = useCallback(() => {
    setSelectedThreadId(null);
  }, []);

  // Format single email for ExpandedMessage component
  const selectedEmailData = useMemo(() => {
    if (!selectedEmail) return null;
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
    };
  }, [selectedEmail]);

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

  // Reading pane component for 3-panel desktop view (single email, not thread)
  const readingPane = useMemo(() => {
    if (!selectedThreadId || !isDesktop) return undefined;

    // Show loading state while fetching email
    if (isEmailLoading) {
      return (
        <Box
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
      <Box sx={{ height: '100%', overflow: 'auto', p: 2 }}>
        <ExpandedMessage
          message={selectedEmailData}
          onCollapse={handleCloseReadingPane}
          onReply={handleReply}
          onReplyAll={handleReplyAll}
          onForward={handleForward}
          onFlag={handleFlagMessage}
          onLabels={handleLabelsMessage}
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
    t.threadView?.loading,
  ]);

  // Refresh emails
  const handleRefresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

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

      // Fall back to list data
      const selectedEmails = emailsData?.emails?.filter((e) => ids.includes(e.id)) || [];
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
    [emailsData?.emails, selectedEmail]
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
      toast.error('Email provider information is missing');
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
      toast.error('Failed to move email(s). Please try again.');
    }
  };

  // Show loading state
  if (isLoading) {
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
        <EmailLayout readingPane={readingPane}>
          <ThreadList
            threads={threads}
            emptyVariant={filters.search ? 'search' : 'inbox'}
            isLoading={isLoading}
            onThreadClick={handleThreadClick}
            onRefresh={handleRefresh}
            onBulkMarkAsRead={handleBulkMarkAsRead}
            onBulkMarkAsUnread={handleBulkMarkAsUnread}
            onBulkArchive={handleBulkArchive}
            onBulkDelete={handleBulkDelete}
            onBulkMove={handleBulkMove}
            onBulkLabel={handleBulkLabel}
            onFlag={handleFlag}
            onArchive={handleArchive}
            onDelete={handleDelete}
            onEmailDrop={handleEmailDrop}
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
