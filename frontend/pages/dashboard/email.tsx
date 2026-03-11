import React, { useState, useCallback, useMemo, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import { Layout } from '@/components/layout/Layout';
import { PageErrorBoundary } from '@/components/common/ErrorBoundary';
import { EmailLayout } from '@/components/email';
import { ThreadList } from '@/components/email/list';

const ExpandedMessage = dynamic(
  () => import('@/components/email/thread').then(m => ({ default: m.ExpandedMessage })),
  { ssr: false, loading: () => null }
);
const LabelPickerDialog = dynamic(
  () => import('@/components/email/labels').then(m => ({ default: m.LabelPickerDialog })),
  { ssr: false, loading: () => null }
);
const FolderPickerDialog = dynamic(
  () => import('@/components/email/folders/FolderPickerDialog').then(m => ({ default: m.FolderPickerDialog })),
  { ssr: false, loading: () => null }
);
const KeyboardShortcutsDialog = dynamic(
  () => import('@/components/email/keyboard').then(m => ({ default: m.KeyboardShortcutsDialog })),
  { ssr: false, loading: () => null }
);

import { useTranslations } from '@/lib/hooks/use-translations';
import { useKeyboardNavigation } from '@/hooks/use-keyboard-navigation';
import { useQueryClient } from '@tanstack/react-query';
import {
  useEmail, useEmails, useFolders, useSenderPhotos, useUserPreferences, emailKeys,
} from '@/hooks/queries';
import type { ListEmailsParams, ListEmailsResponse } from '@/lib/api/emails';
import { useEmailRealtime } from '@/hooks/use-email-realtime';
import { useEmailFilters } from '@/stores/email-ui-store';
import { CircularProgress, Box, Typography, useMediaQuery, useTheme, Fab, Tooltip } from '@mui/material';
import { safeArea } from '@/theme/appTheme';
import { Pencil } from 'lucide-react';
import type { Email } from '@/lib/api/emails';
import { extractEmailAddress, formatEmailToThread } from '@/components/email/utils/email-formatters';
import { useEmailPageActions } from '@/components/email/hooks/use-email-page-actions';

export default function EmailPage() {
  const router = useRouter();
  const t = useTranslations();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const isTablet = useMediaQuery(theme.breakpoints.down('md'));
  const isDesktop = !isMobile && !isTablet;

  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [labelPickerOpen, setLabelPickerOpen] = useState(false);
  const [labelPickerEmailIds, setLabelPickerEmailIds] = useState<string[]>([]);
  const [folderPickerOpen, setFolderPickerOpen] = useState(false);
  const [folderPickerEmailIds, setFolderPickerEmailIds] = useState<string[]>([]);
  const [keyboardShortcutsOpen, setKeyboardShortcutsOpen] = useState(false);
  const [page, setPage] = useState(1);

  const queryClient = useQueryClient();

  const handleCompose = useCallback(() => {
    router.push('/dashboard/email/compose');
  }, [router]);

  // Handle ?id= query param from dashboard widgets
  useEffect(() => {
    const emailId = router.query.id as string;
    if (emailId) {
      if (isDesktop) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSelectedThreadId(emailId);
      } else {
        router.replace(`/dashboard/email/thread/${emailId}`);
      }
      router.replace('/dashboard/email', undefined, { shallow: true });
    }
  }, [router.query.id, isDesktop, router]);

  const filters = useEmailFilters();
  const { data: foldersData } = useFolders();

  const selectedFolderPath = useMemo(() => {
    if (!filters.folderId || !filters.providerId) return undefined;
    const providerFolders = foldersData?.foldersByProvider?.[filters.providerId] || [];
    const selected = providerFolders.find((folder) => folder.id === filters.folderId);
    return selected?.path || selected?.name;
  }, [filters.folderId, filters.providerId, foldersData?.foldersByProvider]);

  useEmailRealtime({
    folder: selectedFolderPath || filters.specialUse || 'INBOX',
    enabled: true,
  });

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

  const baseEmailParams: Omit<ListEmailsParams, 'page'> = useMemo(() => ({
    specialUse: filters.labelId || filters.folderId ? undefined : getApiSpecialUse(filters.specialUse),
    providerId: filters.providerId,
    folder: selectedFolderPath,
    isRead: filters.isRead,
    isImportant: filters.isImportant,
    hasAttachments: filters.hasAttachments,
    search: filters.search,
    from: filters.from,
    to: filters.to,
    subject: filters.subject,
    labelIds: filters.labelId,
    startDate: filters.startDate,
    endDate: filters.endDate,
    fromVip: filters.fromVip,
    limit: 50,
  }), [filters, selectedFolderPath, getApiSpecialUse]);

  const emailQueryParams: ListEmailsParams = useMemo(
    () => ({ ...baseEmailParams, page }),
    [baseEmailParams, page],
  );

  const filterKey = useMemo(() => JSON.stringify(baseEmailParams), [baseEmailParams]);
  const [accumulatedEmails, setAccumulatedEmails] = useState<Email[]>([]);

  useEffect(() => {
    setPage(1); // eslint-disable-line react-hooks/set-state-in-effect
    setAccumulatedEmails([]);
  }, [filterKey]);

  const {
    data: emailsResponse, isLoading: loading, isFetching, refetch,
  } = useEmails(emailQueryParams);

  useEffect(() => {
    const newEmails = emailsResponse?.emails;
    if (!newEmails?.length) return;
    if (page === 1) {
      setAccumulatedEmails(newEmails); // eslint-disable-line react-hooks/set-state-in-effect
    } else {
      setAccumulatedEmails((prev) => {
        const incomingById = new Map(newEmails.map((email) => [email.id, email]));
        const next = prev.map((email) => incomingById.get(email.id) ?? email);
        const existingIds = new Set(next.map((email) => email.id));
        const fresh = newEmails.filter((email) => !existingIds.has(email.id));
        return fresh.length > 0 ? [...next, ...fresh] : next;
      });
    }
  }, [emailsResponse?.emails, page]);

  const emails = accumulatedEmails;
  const responsePagination = emailsResponse?.pagination;
  const hasMore = responsePagination ? responsePagination.page < responsePagination.totalPages : false;
  const loadingMore = isFetching && page > 1;

  const handleLoadMore = useCallback(() => {
    if (!isFetching && hasMore) setPage((p) => p + 1);
  }, [isFetching, hasMore]);

  const { data: selectedEmail, isLoading: isEmailLoading } = useEmail(selectedThreadId || '');
  const { data: preferences } = useUserPreferences();

  const senderEmails = useMemo(() => {
    if (!emails.length) return [];
    return [...new Set(emails.map((e) => extractEmailAddress(e.from)))];
  }, [emails]);

  const { data: senderPhotos } = useSenderPhotos(senderEmails);

  const threads = useMemo(
    () => emails.map((email) => formatEmailToThread(email, senderPhotos)),
    [emails, senderPhotos]
  );

  // Optimistic update helpers
  const optimisticUpdateEmail = useCallback(
    (emailId: string, updates: Partial<Email>) => {
      setAccumulatedEmails((prev) =>
        prev.map((email) => (email.id === emailId ? { ...email, ...updates } : email))
      );
      queryClient.setQueriesData<ListEmailsResponse>(
        { queryKey: emailKeys.list() },
        (old) =>
          old
            ? {
                ...old,
                emails: old.emails.map((email) =>
                  email.id === emailId ? { ...email, ...updates } : email
                ),
              }
            : old
      );
    },
    [queryClient]
  );

  const optimisticUpdateEmails = useCallback(
    (emailIds: string[], updates: Partial<Email>) => {
      const ids = new Set(emailIds);
      setAccumulatedEmails((prev) =>
        prev.map((email) => (ids.has(email.id) ? { ...email, ...updates } : email))
      );
      queryClient.setQueriesData<ListEmailsResponse>(
        { queryKey: emailKeys.list() },
        (old) =>
          old
            ? {
                ...old,
                emails: old.emails.map((email) =>
                  ids.has(email.id) ? { ...email, ...updates } : email
                ),
              }
            : old
      );
    },
    [queryClient]
  );

  const optimisticRemoveEmail = useCallback(
    (emailId: string) => {
      setAccumulatedEmails((prev) => prev.filter((email) => email.id !== emailId));
      queryClient.setQueriesData<ListEmailsResponse>(
        { queryKey: emailKeys.list() },
        (old) =>
          old
            ? { ...old, emails: old.emails.filter((email) => email.id !== emailId) }
            : old
      );
    },
    [queryClient]
  );

  const optimisticRemoveEmails = useCallback(
    (emailIds: string[]) => {
      const ids = new Set(emailIds);
      setAccumulatedEmails((prev) => prev.filter((email) => !ids.has(email.id)));
      queryClient.setQueriesData<ListEmailsResponse>(
        { queryKey: emailKeys.list() },
        (old) =>
          old
            ? { ...old, emails: old.emails.filter((email) => !ids.has(email.id)) }
            : old
      );
    },
    [queryClient]
  );

  const captureEmailsState = useCallback(() => accumulatedEmails, [accumulatedEmails]);
  const restoreEmailsState = useCallback((snapshot: Email[]) => {
    setAccumulatedEmails(snapshot);
  }, []);

  const folderPickerProviderId = useMemo(() => {
    const firstEmailId = folderPickerEmailIds[0];
    if (!firstEmailId) return undefined;
    return emails.find((email) => email.id === firstEmailId)?.providerId;
  }, [emails, folderPickerEmailIds]);

  const folderPickerCurrentFolderId = useMemo(() => {
    if (folderPickerEmailIds.length !== 1) return undefined;
    return emails.find((email) => email.id === folderPickerEmailIds[0])?.folder;
  }, [emails, folderPickerEmailIds]);

  // Action handlers (extracted to hook)
  const {
    handleReply, handleReplyAll, handleForward, handleFlagMessage,
    handleLabelsMessage, handleDeleteMessage, handleArchiveMessage,
    handleMoveMessage, handleMoveMessageToFolder, handleDownloadAttachment,
    handleBulkMarkAsRead, handleBulkMarkAsUnread, handleBulkArchive,
    handleBulkDelete, handleBulkMove, handleBulkLabel,
    handleFlag, handleArchive, handleDelete,
    handleLabelPickerSuccess, handleLabelPickerClose, getCurrentLabelIds,
    handleEmailDrop, handleFolderReorder, handleMoveEmailsToFolder,
    selectedEmailData, updateEmail,
  } = useEmailPageActions({
    emails, threads,
    selectedEmail: selectedEmail ?? null,
    senderPhotos,
    emailQueryParams,
    captureEmailsState, restoreEmailsState,
    optimisticUpdateEmail, optimisticUpdateEmails,
    optimisticRemoveEmail, optimisticRemoveEmails,
    setSelectedThreadId, setLabelPickerOpen, setLabelPickerEmailIds,
    setFolderPickerOpen, setFolderPickerEmailIds,
    foldersData, preferences,
  });

  // Email click - mark as read and show in reading pane
  const handleThreadClick = useCallback(
    async (id: string) => {
      const email = emails.find((e) => e.id === id);
      if (!email) return;
      if (!email.isRead) {
        optimisticUpdateEmail(id, { isRead: true });
        updateEmail.mutate(
          { emailId: id, dto: { isRead: true } },
          { onError: () => optimisticUpdateEmail(id, { isRead: false }) }
        );
      }
      if (isDesktop) {
        setSelectedThreadId(id);
      } else {
        router.push(`/dashboard/email/thread/${id}`);
      }
    },
    [router, emails, isDesktop, updateEmail, optimisticUpdateEmail]
  );

  const handleCloseReadingPane = useCallback(() => setSelectedThreadId(null), []);

  const { focusedId } = useKeyboardNavigation({
    items: threads,
    getItemId: (thread) => thread.id,
    onOpen: handleThreadClick,
    onEscape: handleCloseReadingPane,
    onCompose: handleCompose,
    onArchive: (id) => handleArchive(id),
    onDelete: (id) => handleDelete(id),
    onReply: (id) => handleReply(id),
    onReplyAll: (id) => handleReplyAll(id),
    onForward: (id) => handleForward(id),
    onShowHelp: () => setKeyboardShortcutsOpen(true),
    enabled: !loading && threads.length > 0,
    isReadingPaneOpen: !!selectedThreadId && isDesktop,
  });

  const handleRefresh = useCallback(() => {
    setPage(1);
    setAccumulatedEmails([]);
    refetch();
  }, [refetch]);

  // Reading pane for 3-panel desktop view
  const readingPane = useMemo(() => {
    if (!selectedThreadId || !isDesktop) return undefined;
    if (isEmailLoading) {
      return (
        <Box data-testid="reading-pane" sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 2 }}>
          <CircularProgress size={32} />
          <Typography variant="body2" color="text.secondary">{t.threadView?.loading || 'Loading email...'}</Typography>
        </Box>
      );
    }
    if (!selectedEmailData) return undefined;
    return (
      <Box data-testid="reading-pane" sx={{ height: '100%', overflow: 'auto', p: 2 }}>
        <ExpandedMessage
          message={selectedEmailData}
          onCollapse={handleCloseReadingPane}
          onReply={handleReply} onReplyAll={handleReplyAll} onForward={handleForward}
          onFlag={handleFlagMessage} onLabels={handleLabelsMessage}
          onDownloadAttachment={handleDownloadAttachment}
          onDelete={handleDeleteMessage} onArchive={handleArchiveMessage}
          onMove={handleMoveMessage} onMoveToFolder={handleMoveMessageToFolder}
        />
      </Box>
    );
  }, [
    selectedThreadId, isDesktop, isEmailLoading, selectedEmailData,
    handleCloseReadingPane, handleReply, handleReplyAll, handleForward,
    handleFlagMessage, handleLabelsMessage, handleDownloadAttachment,
    handleDeleteMessage, handleArchiveMessage, handleMoveMessage,
    handleMoveMessageToFolder, t.threadView?.loading,
  ]);

  if (loading && emails.length === 0) {
    return (
      <Layout>
        <EmailLayout>
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 400, gap: 2 }}>
            <CircularProgress size={40} />
            <Typography variant="body2" color="text.secondary">{t.emailList?.loading || 'Loading emails...'}</Typography>
          </Box>
        </EmailLayout>
      </Layout>
    );
  }

  return (
    <PageErrorBoundary pageName="Email">
      <Layout>
        <EmailLayout readingPane={readingPane} onEmailDrop={handleEmailDrop} onFolderReorder={handleFolderReorder}>
          <ThreadList
            threads={threads}
            emptyVariant={filters.search ? 'search' : filters.fromVip ? 'vip' : 'inbox'}
            isLoading={loading} isLoadingMore={loadingMore} hasMore={hasMore}
            focusedId={focusedId}
            onThreadClick={handleThreadClick} onRefresh={handleRefresh} onLoadMore={handleLoadMore}
            onBulkMarkAsRead={handleBulkMarkAsRead} onBulkMarkAsUnread={handleBulkMarkAsUnread}
            onBulkArchive={handleBulkArchive} onBulkDelete={handleBulkDelete}
            onBulkMove={handleBulkMove} onBulkLabel={handleBulkLabel}
            onFlag={handleFlag} onArchive={handleArchive} onDelete={handleDelete}
          />
        </EmailLayout>

        <LabelPickerDialog
          open={labelPickerOpen} onClose={handleLabelPickerClose}
          emailIds={labelPickerEmailIds}
          currentLabelIds={getCurrentLabelIds(labelPickerEmailIds)}
          onSuccess={handleLabelPickerSuccess}
        />
        <FolderPickerDialog
          open={folderPickerOpen}
          onClose={() => { setFolderPickerOpen(false); setFolderPickerEmailIds([]); }}
          emailIds={folderPickerEmailIds}
          providerId={folderPickerProviderId}
          currentFolderId={folderPickerCurrentFolderId}
          onMove={handleMoveEmailsToFolder}
          onSuccess={() => { setFolderPickerOpen(false); setFolderPickerEmailIds([]); setSelectedThreadId(null); }}
        />
        <KeyboardShortcutsDialog open={keyboardShortcutsOpen} onClose={() => setKeyboardShortcutsOpen(false)} />

        <Tooltip title={`${t.email?.composer?.title || 'Compose'} (C)`} placement="left">
          <Fab
            color="primary" aria-label="compose" onClick={handleCompose}
            sx={{ display: { xs: 'none', md: 'flex' }, position: 'fixed', bottom: 24, right: `calc(24px + ${safeArea.right})`, zIndex: 1200 }}
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
