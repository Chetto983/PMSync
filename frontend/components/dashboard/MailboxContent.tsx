import React from 'react';
import { Box } from '@mui/material';
import type { Email } from '@/stores/email-store';
import type { Conversation } from '@/lib/api/email';
import { MailboxHeader } from '@/components/dashboard/MailboxHeader';
import { ThreadList, BulkActionBar } from '@/components/email';
import type { EmailStats } from '@/lib/api/email';

/**
 * Props for MailboxContent component
 */
interface MailboxContentProps {
  // Header props
  isMobile: boolean;
  isConnected: boolean;
  emailStats?: EmailStats;
  isConversationView: boolean;
  syncLoading: boolean;
  onMobileSidebarOpen: () => void;
  onAdvancedSearchOpen: () => void;
  onToggleConversationView: () => void;
  onSync: () => void;

  // List props
  threads: (Email | Conversation)[];
  selectedId?: string;
  selectedIds: Set<string>;
  isLoading: boolean;
  hasMore: boolean;
  emptyTitle: string;
  emptySubtitle: string;
  onThreadClick: (thread: Email | Conversation) => void;
  onToggleSelect: (id: string) => void;
  onToggleRead: (emailId: string, isRead: boolean) => void;
  onToggleStar: (emailId: string, currentStarred: boolean) => void;
  onToggleImportant: (emailId: string, currentImportant: boolean) => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
  onLoadMore: () => void;
  getProviderIcon: (providerId: string) => React.ReactNode;

  // Bulk action props
  totalCount: number;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onBulkMarkRead: () => Promise<void>;
  onBulkMarkUnread: () => Promise<void>;
  onBulkDelete: () => Promise<void>;
  onBulkArchive: () => Promise<void>;
  onBulkStar: () => Promise<void>;
  onBulkUnstar: () => Promise<void>;
  onBulkFlag: () => Promise<void>;
  onBulkUnflag: () => Promise<void>;
  onBulkAddLabels: () => void;
  onBulkMoveToFolder: () => void;
}

/**
 * Main content area of the Mailbox
 * Contains header, bulk action bar, and thread list
 */
export function MailboxContent({
  // Header props
  isMobile,
  isConnected,
  emailStats,
  isConversationView,
  syncLoading,
  onMobileSidebarOpen,
  onAdvancedSearchOpen,
  onToggleConversationView,
  onSync,

  // List props
  threads,
  selectedId,
  selectedIds,
  isLoading,
  hasMore,
  emptyTitle,
  emptySubtitle,
  onThreadClick,
  onToggleSelect,
  onToggleRead,
  onToggleStar,
  onToggleImportant,
  onArchive,
  onDelete,
  onLoadMore,
  getProviderIcon,

  // Bulk action props
  totalCount,
  onSelectAll,
  onClearSelection,
  onBulkMarkRead,
  onBulkMarkUnread,
  onBulkDelete,
  onBulkArchive,
  onBulkStar,
  onBulkUnstar,
  onBulkFlag,
  onBulkUnflag,
  onBulkAddLabels,
  onBulkMoveToFolder,
}: MailboxContentProps) {
  return (
    <Box
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      <MailboxHeader
        isMobile={isMobile}
        setMobileSidebarOpen={onMobileSidebarOpen}
        isConnected={isConnected}
        emailStats={emailStats}
        setAdvancedSearchOpen={onAdvancedSearchOpen}
        isConversationView={isConversationView}
        toggleConversationView={onToggleConversationView}
        handleSyncProviders={onSync}
        syncLoading={syncLoading}
      />

      {/* Bulk Action Bar */}
      <BulkActionBar
        selectedCount={selectedIds.size}
        totalCount={totalCount}
        onSelectAll={onSelectAll}
        onClearSelection={onClearSelection}
        onMarkRead={onBulkMarkRead}
        onMarkUnread={onBulkMarkUnread}
        onDelete={onBulkDelete}
        onArchive={onBulkArchive}
        onStar={onBulkStar}
        onUnstar={onBulkUnstar}
        onFlag={onBulkFlag}
        onUnflag={onBulkUnflag}
        onAddLabels={onBulkAddLabels}
        onMoveToFolder={onBulkMoveToFolder}
      />

      {/* Thread List */}
      <Box sx={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
        <ThreadList
          threads={threads}
          selectedId={selectedId}
          selectedIds={selectedIds}
          isLoading={isLoading}
          onThreadClick={onThreadClick}
          onToggleSelect={onToggleSelect}
          onToggleRead={onToggleRead}
          onToggleStar={onToggleStar}
          onToggleImportant={onToggleImportant}
          onArchive={(id) => onArchive(id)}
          onDelete={onDelete}
          getProviderIcon={getProviderIcon}
          onLoadMore={onLoadMore}
          hasMore={hasMore}
          emptyTitle={emptyTitle}
          emptySubtitle={emptySubtitle}
        />
      </Box>
    </Box>
  );
}
