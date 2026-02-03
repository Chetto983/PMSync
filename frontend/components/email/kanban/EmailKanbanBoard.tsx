'use client';

/**
 * Email Kanban Board Component
 *
 * Main Kanban container with four columns: Inbox, To Reply, Following Up, Done.
 * Uses DndContext for drag-and-drop operations.
 * NOTE: Column assignments are LOCAL ONLY (Zustand state) - backend persistence out of scope.
 */

import React, { useState, useMemo, useCallback } from 'react';
import { Box, Skeleton, Typography } from '@mui/material';
import {
  DndContext,
  DragOverlay,
  DragEndEvent,
  DragStartEvent,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCorners,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useRouter } from 'next/router';
import { useTranslations } from '@/lib/hooks/use-translations';
import {
  useEmailKanban,
  useEmailUIStore,
  KanbanColumnId,
} from '@/stores/email-ui-store';
import { useEmails } from '@/hooks/queries/use-emails';
import { EmailKanbanColumn } from './EmailKanbanColumn';
import { EmailKanbanCard } from './EmailKanbanCard';
import type { ThreadListItemData } from '../list/ThreadListItem';
import type { Email } from '@/lib/api/emails';
import type { AppTranslations } from '@/locales';

// Column definitions using i18n
const getKanbanColumns = (_t: AppTranslations) => [
  { id: 'inbox' as const, titleKey: 'inbox', color: '#1976d2' },
  { id: 'to-reply' as const, titleKey: 'toReply', color: '#ed6c02' },
  { id: 'following-up' as const, titleKey: 'followingUp', color: '#0288d1' },
  { id: 'done' as const, titleKey: 'done', color: '#2e7d32' },
];

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
    providerId: email.providerId,
    labels: email.emailLabels?.map((el) => ({
      id: el.label?.id || '',
      name: el.label?.name || 'Label',
      color: el.label?.color?.backgroundColor || '#9E9E9E',
    })).filter((l) => l.id),
    aiPriority: email.aiPriority,
    aiSentiment: email.aiSentiment,
    aiLabels: email.aiLabels,
  };
}

interface EmailKanbanBoardProps {
  /** Callback when an email card is clicked */
  onEmailClick?: (emailId: string) => void;
}

export function EmailKanbanBoard({ onEmailClick }: EmailKanbanBoardProps) {
  const t = useTranslations();
  const router = useRouter();

  // Kanban state from store
  const { kanbanAssignments, moveEmailToColumn } = useEmailKanban();

  // Filters from store
  const filters = useEmailUIStore((s) => s.filters);
  const openReply = useEmailUIStore((s) => s.openReply);

  // Map special folder to API-supported values (same logic as email.tsx)
  const getApiSpecialUse = (folder?: string): 'INBOX' | 'SENT' | 'DRAFTS' | 'TRASH' | 'SPAM' | 'ARCHIVE' | undefined => {
    const supported = ['INBOX', 'SENT', 'DRAFTS', 'TRASH', 'SPAM', 'ARCHIVE'];
    if (folder && supported.includes(folder)) {
      return folder as 'INBOX' | 'SENT' | 'DRAFTS' | 'TRASH' | 'SPAM' | 'ARCHIVE';
    }
    return undefined;
  };

  // Fetch emails (using same hook as email page)
  const { data: emailsResponse, isLoading, isError } = useEmails({
    ...filters,
    specialUse: filters.labelId || filters.folderId
      ? undefined
      : getApiSpecialUse(filters.specialUse) || 'INBOX',
    limit: 100, // Load more for Kanban view
  });

  // Format emails to thread list format
  const allEmails = useMemo(() => {
    const emails = emailsResponse?.emails ?? [];
    return emails.map((email) => formatEmailToThread(email));
  }, [emailsResponse?.emails]);

  // Group emails by column based on kanbanAssignments
  const emailsByColumn = useMemo(() => {
    const result: Record<KanbanColumnId, ThreadListItemData[]> = {
      inbox: [],
      'to-reply': [],
      'following-up': [],
      done: [],
    };

    allEmails.forEach((email) => {
      const column = kanbanAssignments[email.id] || 'inbox';
      result[column].push(email);
    });

    return result;
  }, [allEmails, kanbanAssignments]);

  // Drag state
  const [activeId, setActiveId] = useState<string | null>(null);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Get active email for DragOverlay
  const activeEmail = useMemo(
    () => (activeId ? allEmails.find((e) => e.id === activeId) : null),
    [activeId, allEmails]
  );

  // Drag handlers
  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveId(null);

      if (!over) return;

      const emailId = active.id as string;
      const overId = over.id as string;

      // Determine which column was dropped on
      // overId could be a column id or an email id
      let targetColumn: KanbanColumnId | undefined;

      // Check if overId is a column
      const columns = getKanbanColumns(t);
      const isColumn = columns.some((c) => c.id === overId);

      if (isColumn) {
        targetColumn = overId as KanbanColumnId;
      } else {
        // overId is an email - find which column it's in
        for (const [col, emails] of Object.entries(emailsByColumn)) {
          if (emails.some((e) => e.id === overId)) {
            targetColumn = col as KanbanColumnId;
            break;
          }
        }
      }

      if (targetColumn) {
        moveEmailToColumn(emailId, targetColumn);
      }
    },
    [t, emailsByColumn, moveEmailToColumn]
  );

  const handleDragCancel = useCallback(() => {
    setActiveId(null);
  }, []);

  // Email click handler
  const handleEmailClick = useCallback(
    (emailId: string) => {
      if (onEmailClick) {
        onEmailClick(emailId);
      } else {
        // Default: navigate to email
        router.push(`/dashboard/email?id=${emailId}`);
      }
    },
    [onEmailClick, router]
  );

  // Reply handler
  const handleReply = useCallback(
    (emailId: string) => {
      openReply(emailId);
    },
    [openReply]
  );

  // Archive handler - move to done column
  const handleArchive = useCallback(
    (emailId: string) => {
      moveEmailToColumn(emailId, 'done');
    },
    [moveEmailToColumn]
  );

  // Get column title from i18n
  const getColumnTitle = (titleKey: string) => {
    const kanbanTranslations = t.email?.kanban;
    if (kanbanTranslations && titleKey in kanbanTranslations) {
      return kanbanTranslations[titleKey as keyof typeof kanbanTranslations];
    }
    // Fallback
    const fallback: Record<string, string> = {
      inbox: 'Inbox',
      toReply: 'To Reply',
      followingUp: 'Following Up',
      done: 'Done',
    };
    return fallback[titleKey] || titleKey;
  };

  // Loading state
  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', gap: 2, p: 2, overflow: 'auto' }}>
        {[1, 2, 3, 4].map((i) => (
          <Box key={i} sx={{ minWidth: 280, maxWidth: 320, flex: '1 1 280px' }}>
            <Skeleton variant="rectangular" height={52} sx={{ borderRadius: 2, mb: 1 }} />
            <Skeleton variant="rectangular" height={120} sx={{ borderRadius: 2, mb: 1 }} />
            <Skeleton variant="rectangular" height={120} sx={{ borderRadius: 2, mb: 1 }} />
            <Skeleton variant="rectangular" height={120} sx={{ borderRadius: 2 }} />
          </Box>
        ))}
      </Box>
    );
  }

  // Error state
  if (isError) {
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          p: 4,
        }}
      >
        <Typography color="error">
          Failed to load emails. Please try again.
        </Typography>
      </Box>
    );
  }

  const columns = getKanbanColumns(t);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <Box
        sx={{
          display: 'flex',
          gap: 2,
          p: 2,
          height: '100%',
          overflow: 'auto',
          alignItems: 'flex-start',
        }}
      >
        {columns.map((column) => (
          <EmailKanbanColumn
            key={column.id}
            id={column.id}
            title={getColumnTitle(column.titleKey)}
            color={column.color}
            emails={emailsByColumn[column.id]}
            onEmailClick={handleEmailClick}
            onEmailReply={handleReply}
            onEmailArchive={handleArchive}
          />
        ))}
      </Box>

      {/* Drag overlay - shows the card being dragged */}
      <DragOverlay>
        {activeEmail ? (
          <EmailKanbanCard email={activeEmail} isDragging />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

export default EmailKanbanBoard;
