import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/router';
import { useQueryClient } from '@tanstack/react-query';
import { useMediaQuery, useTheme } from '@mui/material';
import {
  DndContext,
  DragStartEvent,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
  pointerWithin,
} from '@dnd-kit/core';
import { emailApi, type Conversation } from '@/lib/api/email';

import { logger } from '@/lib/logger';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useEmailStore, type Email } from '@/stores/email-store';
import { useFoldersStore } from '@/stores/folders-store';
import { websocketClient } from '@/lib/websocket-client';
import { useEmailActions } from '@/hooks/use-email-actions';
import { useComposeHandlers } from '@/components/dashboard/hooks/use-compose-handlers';
import { useKeyboardNavigation } from '@/hooks/use-keyboard-navigation';
import { emailKeys } from '@/hooks/queries';
import { useFolderLogic, type FolderItem } from '@/components/dashboard/hooks/use-folder-logic';
import { useSelectionLogic } from '@/components/dashboard/hooks/use-selection-logic';

// New extracted hooks and components
import { useMailboxState } from '@/components/dashboard/hooks/useMailboxState';
import { useMailboxData, mapApiEmailToStore } from '@/components/dashboard/hooks/useMailboxData';
import { useMailboxActions } from '@/components/dashboard/hooks/useMailboxActions';
import { MailboxDialogs } from '@/components/dashboard/MailboxDialogs';
import { MailboxContent } from '@/components/dashboard/MailboxContent';

// Components
import {
  ResizableEmailLayout,
  EmailSidebar,
  ThreadDisplay,
  EmailDragOverlay,
} from '@/components/email';

/**
 * Props for Mailbox component
 */
interface MailboxProps {
  initialSearchQuery?: string;
  initialEmailId?: string;
}

/**
 * Mailbox - Modern email interface with unified components
 *
 * Uses extracted hooks for state, data, and actions management
 * Components are split for maintainability
 */
export function Mailbox({ initialSearchQuery, initialEmailId }: MailboxProps = {}) {
  const router = useRouter();
  const t = useTranslations();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const queryClient = useQueryClient();

  // Centralized state management
  const state = useMailboxState({ initialSearchQuery });
  const {
    selectedFolderId,
    setSelectedFolderId,
    openCompose,
    closeCompose,
    setAdvancedSearchOpen,
    setLabelManagerOpen,
    setLabelSelectorOpen,
    setFolderSelectorOpen,
    advancedFilters,
    setAdvancedFilters,
    syncLoading,
    mobileSidebarOpen,
    setMobileSidebarOpen,
    forceConversationView,
    toggleConversationView,
    showSnackbar,
  } = state;

  // Store state
  const storeSelectedEmail = useEmailStore((state) => state.selectedEmail);
  const setSelectedEmail = useEmailStore((state) => state.setSelectedEmail);
  const toggleSelection = useEmailStore((state) => state.toggleSelection);
  const clearSelection = useEmailStore((state) => state.clearSelection);

  // Folder state from store
  const foldersByProvider = useFoldersStore((state) => state.foldersByProvider);

  // WebSocket connection status
  const [isConnected, setIsConnected] = useState(() => websocketClient.isConnected());

  // Track mounted state to prevent state updates after unmount (race condition fix)
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const unsubConnected = websocketClient.onConnected(() => setIsConnected(true));
    const unsubClose = websocketClient.onClose(() => setIsConnected(false));
    return () => {
      unsubConnected();
      unsubClose();
    };
  }, []);

  // Folder logic
  const { smartFilters, combinedFolders, folderGroups, getProviderIcon } = useFolderLogic({
    emailStats: null,
    providers: [],
  });

  // Active folder
  const activeFolder = useMemo<FolderItem | null>(() => {
    if (selectedFolderId) {
      return combinedFolders.find((folder) => folder.id === selectedFolderId) ?? combinedFolders[0] ?? null;
    }
    return combinedFolders[0] ?? null;
  }, [combinedFolders, selectedFolderId]);

  // Data fetching
  const mailboxData = useMailboxData({
    activeFolder,
    advancedFilters,
    searchQuery: initialSearchQuery,
    forceConversationView,
  });

  const {
    emailStats,
    threads,
    providers,
    listLoading,
    foldersLoading,
    hasMoreItems,
    isConversationView,
    loadFolderMetadata,
    onLoadMoreThreads,
    defaultProviderId,
  } = mailboxData;

  // Actions
  const actions = useMailboxActions({ state, t });
  const { handleSyncProviders, handleLabelsChange, handleRefresh } = actions;

  // Drag-and-drop state
  const [draggedEmail, setDraggedEmail] = useState<Email | Conversation | null>(null);
  const [isDraggingEmail, setIsDraggingEmail] = useState(false);

  const dndSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 10 },
    })
  );

  // Email actions hook
  const {
    handleDelete,
    handleBulkDelete: handleBulkDeleteEmails,
    handleMarkAsRead,
    handleToggleRead,
    handleToggleStar,
    handleToggleImportant,
    handleArchive,
    handleReply,
    handleEmailClick: handleEmailClickOriginal,
  } = useEmailActions({
    onSuccess: (message) => showSnackbar(message, 'success'),
    onError: (message) => showSnackbar(message, 'error'),
  });

  // Handle email click - supports both Email and Conversation types
  const handleEmailClick = useCallback(async (thread: Email | Conversation) => {
    if ('providerId' in thread) {
      useEmailStore.getState().updateEmail(thread.id, thread);
      handleEmailClickOriginal(thread as Email);
    } else if ('latestEmailId' in thread && thread.latestEmailId) {
      try {
        const response = await emailApi.getEmail(thread.latestEmailId);
        // Check if still mounted before state updates (race condition fix)
        if (!isMountedRef.current) return;
        const email = mapApiEmailToStore(response.data);
        useEmailStore.getState().updateEmail(email.id, email);
        handleEmailClickOriginal(email);
      } catch (error) {
        // Check if still mounted before state updates (race condition fix)
        if (!isMountedRef.current) return;
        logger.error('Failed to open conversation email', { error });
        showSnackbar(t.email.messages.failedToOpenEmail, 'error');
      }
    }
  }, [handleEmailClickOriginal, showSnackbar, t.email.messages.failedToOpenEmail]);

  // Selection logic
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
    resolveEmailIdsForThread,
  } = useSelectionLogic({
    threads,
    onSuccess: (message: string) => showSnackbar(message, 'success'),
    onError: (message: string) => showSnackbar(message, 'error'),
    handleMarkAsRead,
    handleArchive,
    handleBulkDeleteEmails,
  });

  // Compose handlers - pass openCompose directly to avoid stale closure issues
  const { handleReply: handleReplyLocal, handleReplyAll: handleReplyAllLocal, handleForward: handleForwardLocal } =
    useComposeHandlers({ openCompose });

  // Handle compose query params
  useEffect(() => {
    const { compose, replyTo, forward, to, subject } = router.query;
    if (!compose) return;

    const openFromQuery = async () => {
      if (compose === 'reply' && replyTo) {
        // Fetch email to build proper reply with quoted body
        try {
          const response = await emailApi.getEmail(String(replyTo));
          const email = response.data;
          // Use the proper reply handler which builds quoted body
          handleReplyLocal(mapApiEmailToStore(email));
        } catch (error) {
          logger.error('[Mailbox] Failed to fetch email for reply', { error });
          // Fallback: open with minimal data
          openCompose('reply', {
            originalEmailId: String(replyTo),
            to: to ? [String(to)] : undefined,
            subject: subject ? String(subject) : undefined,
          });
        }
      } else if (compose === 'forward' && forward) {
        // Fetch email to build proper forward with body
        try {
          const response = await emailApi.getEmail(String(forward));
          const email = response.data;
          // Use the proper forward handler which builds body
          handleForwardLocal(mapApiEmailToStore(email));
        } catch (error) {
          logger.error('[Mailbox] Failed to fetch email for forward', { error });
          // Fallback: open with minimal data
          openCompose('forward', {
            originalEmailId: String(forward),
            subject: subject ? String(subject) : undefined,
          });
        }
      } else {
        openCompose('compose', null);
      }
      router.replace({ pathname: router.pathname, query: {} }, undefined, { shallow: true });
    };

    void openFromQuery();
  }, [router, router.query, openCompose, handleReplyLocal, handleForwardLocal]);

  // Handle drag start
  const handleDragStart = useCallback((event: DragStartEvent) => {
    const dragData = event.active.data.current;
    if (dragData?.type === 'email') {
      setDraggedEmail(dragData.email as Email | Conversation);
      setIsDraggingEmail(true);
    }
  }, []);

  // Handle drag end - move email to folder
  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    setDraggedEmail(null);
    setIsDraggingEmail(false);

    if (!over || !active.data.current) return;

    const dragData = active.data.current;
    const dropData = over.data.current;

    if (dragData.type !== 'email' || dropData?.type !== 'folder') return;

    const targetFolder = dropData.folder as FolderItem;
    const targetFolderName = targetFolder.filterFolder || targetFolder.label;

    if (dragData.isSelected && selectedIds.size > 0) {
      await handleBulkMoveToFolder(targetFolderName);
    } else {
      const droppedThread = dragData.email as Email | Conversation;
      const emailIdsToMove = await resolveEmailIdsForThread(droppedThread);

      if (emailIdsToMove.length === 0) return;

      try {
        await emailApi.bulkMoveToFolder(emailIdsToMove, targetFolderName);
        queryClient.invalidateQueries({ queryKey: emailKeys.lists() });
        queryClient.invalidateQueries({ queryKey: emailKeys.conversations() });
        queryClient.invalidateQueries({ queryKey: emailKeys.stats() });
        showSnackbar(
          t.email.messages.moved.replace('{count}', '1').replace('{folder}', targetFolder.label),
          'success'
        );
      } catch (error) {
        logger.error('[Mailbox] Failed to move emails', { error });
        showSnackbar(t.email.messages.moveFailed, 'error');
      }
    }
  }, [handleBulkMoveToFolder, queryClient, resolveEmailIdsForThread, selectedIds, showSnackbar, t.email.messages]);

  // Load folders on mount
  useEffect(() => {
    loadFolderMetadata();
  }, [loadFolderMetadata]);

  // Auto-select first folder
  useEffect(() => {
    if (!selectedFolderId && combinedFolders.length > 0) {
      setSelectedFolderId(combinedFolders[0].id);
    }
  }, [combinedFolders, selectedFolderId, setSelectedFolderId]);

  // Load initial email from URL
  useEffect(() => {
    if (initialEmailId && !storeSelectedEmail) {
      emailApi.getEmail(initialEmailId)
        .then((response) => {
          if (response.data) setSelectedEmail(response.data);
        })
        .catch((error) => logger.error('Failed to load initial email', { error, emailId: initialEmailId }));
    }
  }, [initialEmailId, setSelectedEmail, storeSelectedEmail]);

  // Clear selection on context changes
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

  // Get empty state text
  const getEmptyState = useCallback(() => {
    if (!selectedFolderId) {
      return { title: t.email.empty.defaultTitle, subtitle: t.email.empty.defaultSubtitle };
    }
    if (selectedFolderId.startsWith('smart:unread')) {
      return { title: t.email.empty.unreadTitle, subtitle: t.email.empty.unreadSubtitle };
    }
    if (selectedFolderId.startsWith('label:')) {
      return { title: t.email.empty.labelTitle, subtitle: t.email.empty.labelSubtitle };
    }

    // Check folder specialUse
    let specialUse: string | undefined;
    for (const folders of Object.values(foldersByProvider)) {
      const folder = folders.find(f => f.id === selectedFolderId);
      if (folder?.specialUse) {
        specialUse = folder.specialUse.toUpperCase();
        break;
      }
    }

    if (specialUse === 'TRASH') return { title: t.email.empty.trashTitle, subtitle: t.email.empty.trashSubtitle };
    if (specialUse === 'SENT') return { title: t.email.empty.sentTitle, subtitle: t.email.empty.sentSubtitle };
    return { title: t.email.empty.defaultTitle, subtitle: t.email.empty.defaultSubtitle };
  }, [selectedFolderId, t, foldersByProvider]);

  const emptyBase = getEmptyState();
  const emptyState = {
    ...emptyBase,
    subtitle: `${emptyBase.subtitle} ${t.email.messages.trySyncOrFilter}`.trim(),
  };

  const dragCount = useMemo(() => {
    if (!isDraggingEmail) return 1;
    const draggedKey = draggedEmail ? getThreadKey(draggedEmail) : '';
    if (draggedKey && selectedIds.has(draggedKey) && selectedIds.size > 1) {
      return selectedIds.size;
    }
    return 1;
  }, [getThreadKey, isDraggingEmail, draggedEmail, selectedIds]);

  const selectedListId = storeSelectedEmail?.threadId || storeSelectedEmail?.id;

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
              if (isMobile) setMobileSidebarOpen(false);
            }}
            loading={foldersLoading}
            smartFilters={smartFilters}
            showSmartFilters={true}
            showLabels={true}
            onManageLabels={() => setLabelManagerOpen(true)}
            onCompose={() => openCompose()}
            isEmailDragging={isDraggingEmail}
            onFoldersRefresh={loadFolderMetadata}
          />
        }
        list={
          <MailboxContent
            isMobile={isMobile}
            isConnected={isConnected}
            emailStats={emailStats ?? undefined}
            filteredCount={threads.length}
            activeFilterName={selectedFolderId?.startsWith('smart:') ? activeFolder?.label : undefined}
            isConversationView={isConversationView}
            syncLoading={syncLoading}
            onMobileSidebarOpen={() => setMobileSidebarOpen(true)}
            onAdvancedSearchOpen={() => setAdvancedSearchOpen(true)}
            onToggleConversationView={toggleConversationView}
            onSync={() => handleSyncProviders(providers)}
            threads={threads}
            selectedId={selectedListId}
            selectedIds={selectedIds}
            isLoading={listLoading}
            hasMore={hasMoreItems}
            emptyTitle={emptyState.title}
            emptySubtitle={emptyState.subtitle}
            onThreadClick={handleEmailClick}
            onToggleSelect={toggleSelection}
            onToggleRead={handleToggleRead}
            onToggleStar={handleToggleStar}
            onToggleImportant={handleToggleImportant}
            onArchive={(id) => handleArchive([id])}
            onDelete={handleDelete}
            onLoadMore={onLoadMoreThreads}
            getProviderIcon={getProviderIcon}
            totalCount={threads.length}
            onSelectAll={handleSelectAll}
            onClearSelection={clearSelection}
            onBulkMarkRead={handleBulkMarkRead}
            onBulkMarkUnread={handleBulkMarkUnread}
            onBulkDelete={handleBulkDelete}
            onBulkArchive={handleBulkArchiveLocal}
            onBulkStar={handleBulkStar}
            onBulkUnstar={handleBulkUnstar}
            onBulkFlag={handleBulkFlag}
            onBulkUnflag={handleBulkUnflag}
            onBulkAddLabels={() => setLabelSelectorOpen(true)}
            onBulkMoveToFolder={() => setFolderSelectorOpen(true)}
          />
        }
        detail={
          storeSelectedEmail ? (
            <ThreadDisplay
              email={storeSelectedEmail}
              onClose={() => setSelectedEmail(null)}
              onDelete={(email) => handleDelete(email.id)}
              onReply={handleReplyLocal}
              onReplyAll={handleReplyAllLocal}
              onForward={handleForwardLocal}
              onLabelsChange={handleLabelsChange}
              onArchive={(email) => handleArchive([email.id])}
              onToggleStar={(id, isStarred) => handleToggleStar(id, isStarred)}
              onToggleImportant={(id, isImportant) => handleToggleImportant(id, isImportant)}
              onToggleRead={(id, isRead) => handleToggleRead(id, isRead)}
            />
          ) : undefined
        }
        showDetail={!!storeSelectedEmail}
      />

      {/* All dialogs */}
      <MailboxDialogs
        state={state}
        defaultProviderId={defaultProviderId}
        onAdvancedSearch={setAdvancedFilters}
        onBulkAddLabels={handleBulkAddLabels}
        onBulkMoveToFolder={handleBulkMoveToFolder}
        onSent={() => {
          showSnackbar(t.email.messages.emailSent, 'success');
          closeCompose();
          handleRefresh();
        }}
        selectedCount={selectedIds.size}
      />

      {/* Drag overlay */}
      <EmailDragOverlay activeEmail={draggedEmail} dragCount={dragCount} />
    </DndContext>
  );
}
