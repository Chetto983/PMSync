import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
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
import { useQueries, useQueryClient } from '@tanstack/react-query';
import {
  useEmail, useFolders, useSenderPhotos, useUserPreferences, emailKeys, emailsListOptions,
  useMoveFolder,
} from '@/hooks/queries';
import type { ListEmailsParams, ListEmailsResponse } from '@/lib/api/emails';
import { useEmailRealtime } from '@/hooks/use-email-realtime';
import { useEmailFilters, useEmailUIStore } from '@/stores/email-ui-store';
import { CircularProgress, Box, Skeleton, Typography, useMediaQuery, useTheme, Fab, Tooltip } from '@mui/material';
import { safeArea } from '@/theme/appTheme';
import { Pencil } from 'lucide-react';
import type { Email } from '@/lib/api/emails';
import { extractEmailAddress, formatEmailToThread } from '@/components/email/utils/email-formatters';
import { useEmailPageActions, type EmailPageStateSnapshot } from '@/components/email/hooks/use-email-page-actions';

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
  const queryClient = useQueryClient();

  const handleCompose = useCallback(() => {
    router.push('/dashboard/email/compose');
  }, [router]);

  // Handle ?id= query param from dashboard widgets
  useEffect(() => {
    if (!router.isReady) return;

    const emailId =
      typeof router.query.id === 'string' ? router.query.id : null;

    if (!emailId) return;

    if (isDesktop) {
      queueMicrotask(() => setSelectedThreadId(emailId));
      void router.replace('/dashboard/email', undefined, { shallow: true });
      return;
    }

    void router.replace(`/dashboard/email/thread/${emailId}`);
  }, [router.isReady, router.query.id, isDesktop, router]);

  const filters = useEmailFilters();
  const setFilters = useEmailUIStore((s) => s.setFilters);
  const clearFilters = useEmailUIStore((s) => s.clearFilters);

  // ── URL ↔ Filter Sync (anti-pattern #3: filters not in URL) ──
  // On mount: seed store from URL query params
  const urlSyncedRef = useRef(false);
  useEffect(() => {
    if (!router.isReady || urlSyncedRef.current) return;
    urlSyncedRef.current = true;

    const q = router.query;
    const patch: Record<string, string | boolean | undefined> = {};
    if (typeof q.folder === 'string') patch.specialUse = q.folder;
    if (typeof q.providerId === 'string') patch.providerId = q.providerId;
    if (typeof q.folderId === 'string') patch.folderId = q.folderId;
    if (typeof q.search === 'string') patch.search = q.search;
    if (typeof q.labelId === 'string') patch.labelId = q.labelId;
    if (q.unread === 'true') patch.isRead = false;
    if (q.vip === 'true') patch.fromVip = true;

    if (Object.keys(patch).length > 0) {
      setFilters(patch);
    }
  }, [router.isReady, router.query, setFilters]);

  // On filter change: push to URL (shallow, no refetch)
  const prevFilterKeyRef = useRef('');
  useEffect(() => {
    if (!router.isReady || !urlSyncedRef.current) return;

    const params: Record<string, string> = {};
    if (filters.specialUse && filters.specialUse !== 'INBOX') params.folder = filters.specialUse;
    if (filters.providerId) params.providerId = filters.providerId;
    if (filters.folderId) params.folderId = filters.folderId;
    if (filters.search) params.search = filters.search;
    if (filters.labelId) params.labelId = filters.labelId;
    if (filters.isRead === false) params.unread = 'true';
    if (filters.fromVip) params.vip = 'true';

    const key = JSON.stringify(params);
    if (key === prevFilterKeyRef.current) return;
    prevFilterKeyRef.current = key;

    void router.replace(
      { pathname: '/dashboard/email', query: params },
      undefined,
      { shallow: true },
    );
  }, [router, filters]);

  const foldersQuery = useFolders();
  const { data: foldersData } = foldersQuery;

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

  const filterKey = useMemo(() => JSON.stringify(baseEmailParams), [baseEmailParams]);
  const [pagingState, setPagingState] = useState(() => ({ page: 1, filterKey }));

  const effectivePage = pagingState.filterKey === filterKey ? pagingState.page : 1;
  const emailQueryParams = useMemo(
    () => ({ ...baseEmailParams, page: effectivePage }),
    [baseEmailParams, effectivePage]
  );

  const emailQueries = useQueries({
    queries: Array.from({ length: effectivePage }, (_, index) =>
      emailsListOptions({ ...baseEmailParams, page: index + 1 })
    ),
  });

  const isFetching = emailQueries.some((query) => query.isFetching);
  const loading = emailQueries[0]?.isLoading ?? false;

  const emails = useMemo(() => {
    const merged = new Map<string, Email>();
    emailQueries.forEach((query) => {
      query.data?.emails.forEach((email) => {
        merged.set(email.id, email);
      });
    });
    return Array.from(merged.values());
  }, [emailQueries]);

  const responsePagination = emailQueries[effectivePage - 1]?.data?.pagination;
  const totalEmailCount = responsePagination?.total ?? 0;
  const hasMore = responsePagination ? responsePagination.page < responsePagination.totalPages : false;
  const loadingMore =
    effectivePage > 1 && (emailQueries[effectivePage - 1]?.isFetching ?? false);

  const handleLoadMore = useCallback(() => {
    if (!isFetching && hasMore) {
      setPagingState((current) => ({
        page: (current.filterKey === filterKey ? current.page : 1) + 1,
        filterKey,
      }));
    }
  }, [filterKey, hasMore, isFetching]);

  const { data: selectedEmail, isLoading: isEmailLoading } = useEmail(selectedThreadId || '');
  const { data: preferences } = useUserPreferences();

  useEffect(() => {
    if (!selectedThreadId || !isDesktop || loading) return;

    const selectedStillVisible = emails.some((email) => email.id === selectedThreadId);
    if (!selectedStillVisible) {
      queueMicrotask(() => setSelectedThreadId(null));
    }
  }, [emails, isDesktop, loading, selectedThreadId]);

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

  const captureEmailsState = useCallback(
    (): EmailPageStateSnapshot => ({
      lists: queryClient.getQueriesData<ListEmailsResponse>({ queryKey: emailKeys.list() }),
    }),
    [queryClient]
  );
  const restoreEmailsState = useCallback((snapshot: EmailPageStateSnapshot) => {
    snapshot.lists.forEach(([queryKey, data]) => {
      queryClient.setQueryData(queryKey, data);
    });
  }, [queryClient]);

  const folderPickerProviderId = useMemo(() => {
    const firstEmailId = folderPickerEmailIds[0];
    if (!firstEmailId) return undefined;
    return emails.find((email) => email.id === firstEmailId)?.providerId;
  }, [emails, folderPickerEmailIds]);

  const folderPickerCurrentFolderValue = useMemo(() => {
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
    selectedEmailData, updateEmail, isBulkActionPending,
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

  // Folder move (reparenting via DnD)
  const moveFolderMutation = useMoveFolder();
  const handleFolderMove = useCallback(
    (providerId: string, folderId: string, newParentId: string) => {
      moveFolderMutation.mutate({ folderId, parentId: newParentId, providerId });
    },
    [moveFolderMutation],
  );

  // Email click - mark as read and show in reading pane
  const handleThreadClick = useCallback(
    async (id: string) => {
      const email = emails.find((e) => e.id === id);
      if (!email) return;
      if (email.isDraft) {
        router.push(`/dashboard/email/compose?draftId=${id}`);
        return;
      }
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

  const handleMarkThreadAsRead = useCallback(
    (id: string) => {
      optimisticUpdateEmail(id, { isRead: true });
      updateEmail.mutate(
        { emailId: id, dto: { isRead: true } },
        { onError: () => optimisticUpdateEmail(id, { isRead: false }) },
      );
    },
    [optimisticUpdateEmail, updateEmail],
  );

  const handleMarkThreadAsUnread = useCallback(
    (id: string) => {
      optimisticUpdateEmail(id, { isRead: false });
      updateEmail.mutate(
        { emailId: id, dto: { isRead: false } },
        { onError: () => optimisticUpdateEmail(id, { isRead: true }) },
      );
    },
    [optimisticUpdateEmail, updateEmail],
  );

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
    setPagingState({ page: 1, filterKey });
    queryClient.invalidateQueries({ queryKey: emailKeys.list() });
    queryClient.invalidateQueries({ queryKey: emailKeys.stats() });
    // Also refresh folder + label counts on manual refresh
    queryClient.invalidateQueries({ queryKey: ['folders'] });
    queryClient.invalidateQueries({ queryKey: ['labels'] });
  }, [filterKey, queryClient]);

  // Empty state CTA (anti-pattern #9 fix)
  const handleEmptyAction = useCallback(() => {
    if (filters.search) {
      clearFilters();
    } else {
      handleCompose();
    }
  }, [filters.search, clearFilters, handleCompose]);

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
      <Box
        key={selectedThreadId}
        data-testid="reading-pane"
        sx={{
          height: '100%',
          overflow: 'auto',
          p: 2,
          // Fade-in on thread switch (respects reduced-motion)
          '@keyframes fadeIn': {
            from: { opacity: 0 },
            to: { opacity: 1 },
          },
          animation: 'fadeIn 150ms ease-out',
          '@media (prefers-reduced-motion: reduce)': {
            animation: 'none',
          },
        }}
      >
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
        <EmailLayout
          foldersData={foldersData}
          foldersLoading={foldersQuery.isLoading}
          foldersFetching={foldersQuery.isFetching}
          onRefreshFolders={async () => {
            await foldersQuery.refetch();
          }}
        >
          <Box sx={{ p: 2 }}>
            {Array.from({ length: 8 }).map((_, i) => (
              <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
                <Skeleton variant="circular" width={40} height={40} animation="wave" />
                <Box sx={{ flex: 1 }}>
                  <Skeleton width="40%" height={20} animation="wave" />
                  <Skeleton width="70%" height={16} animation="wave" sx={{ mt: 0.5 }} />
                </Box>
                <Skeleton width={60} height={16} animation="wave" />
              </Box>
            ))}
          </Box>
        </EmailLayout>
      </Layout>
    );
  }

  return (
    <PageErrorBoundary pageName="Email">
      <Layout>
        <EmailLayout
          readingPane={readingPane}
          onEmailDrop={handleEmailDrop}
          onFolderReorder={handleFolderReorder}
          onFolderMove={handleFolderMove}
          foldersData={foldersData}
          foldersLoading={foldersQuery.isLoading}
          foldersFetching={foldersQuery.isFetching}
          onRefreshFolders={async () => {
            await foldersQuery.refetch();
          }}
        >
          <ThreadList
            threads={threads}
            totalCount={totalEmailCount}
            scrollKey={filterKey}
            emptyVariant={filters.search ? 'search' : filters.fromVip ? 'vip' : 'inbox'}
            isLoading={loading} isLoadingMore={loadingMore} hasMore={hasMore}
            focusedId={focusedId}
            onThreadClick={handleThreadClick} onRefresh={handleRefresh} onLoadMore={handleLoadMore}
            onBulkMarkAsRead={handleBulkMarkAsRead} onBulkMarkAsUnread={handleBulkMarkAsUnread}
            onBulkArchive={handleBulkArchive} onBulkDelete={handleBulkDelete}
            onBulkMove={handleBulkMove} onBulkLabel={handleBulkLabel}
            onFlag={handleFlag} onArchive={handleArchive} onDelete={handleDelete}
            onReply={handleReply} onReplyAll={handleReplyAll} onForward={handleForward}
            onMarkAsRead={handleMarkThreadAsRead}
            onMarkAsUnread={handleMarkThreadAsUnread}
            onLabel={handleLabelsMessage}
            isBulkActionPending={isBulkActionPending}
            onEmptyAction={handleEmptyAction}
            onCompose={handleCompose}
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
          currentFolderValue={folderPickerCurrentFolderValue}
          onMove={handleMoveEmailsToFolder}
          onSuccess={() => { setFolderPickerOpen(false); setFolderPickerEmailIds([]); setSelectedThreadId(null); }}
        />
        <KeyboardShortcutsDialog open={keyboardShortcutsOpen} onClose={() => setKeyboardShortcutsOpen(false)} />

        <Tooltip title={`${t.email?.composer?.title || 'Compose'} (C)`} placement="left">
          <Fab
            color="primary"
            aria-label="compose"
            onClick={handleCompose}
            sx={{
              position: 'fixed',
              bottom: 24,
              right: `calc(24px + ${safeArea.right})`,
              zIndex: 1250,
              display: { xs: 'none', md: 'flex' },
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
