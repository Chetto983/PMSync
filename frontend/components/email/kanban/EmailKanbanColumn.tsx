'use client';

/**
 * Email Kanban Column Component
 *
 * Droppable column for the email Kanban board.
 * Displays column header with title, count, and contains cards.
 */

import React, { memo, useMemo } from 'react';
import {
  Box,
  Typography,
  Chip,
  Collapse,
  IconButton,
  useTheme,
  alpha,
} from '@mui/material';
import { useDroppable } from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { EmailKanbanCard } from './EmailKanbanCard';
import type { ThreadListItemData } from '../list/ThreadListItem';
import type { KanbanColumnId } from '@/stores/email-ui-store';

interface EmailKanbanColumnProps {
  id: KanbanColumnId;
  title: string;
  color: string;
  emails: ThreadListItemData[];
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  onEmailClick?: (emailId: string) => void;
  onEmailReply?: (emailId: string) => void;
  onEmailArchive?: (emailId: string) => void;
}

export const EmailKanbanColumn = memo(function EmailKanbanColumn({
  id,
  title,
  color,
  emails,
  isCollapsed = false,
  onToggleCollapse,
  onEmailClick,
  onEmailReply,
  onEmailArchive,
}: EmailKanbanColumnProps) {
  const theme = useTheme();
  const t = useTranslations();
  const { setNodeRef, isOver } = useDroppable({ id });

  const emailIds = useMemo(() => emails.map((e) => e.id), [emails]);
  const unreadCount = useMemo(
    () => emails.filter((e) => e.isUnread).length,
    [emails]
  );

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        minWidth: 280,
        maxWidth: 320,
        flex: '1 1 280px',
        bgcolor: alpha(theme.palette.background.default, 0.5),
        borderRadius: 2,
        border: 1,
        borderColor: isOver ? 'primary.main' : 'divider',
        overflow: 'hidden',
        transition: 'border-color 0.2s, box-shadow 0.2s',
        boxShadow: isOver ? `0 0 0 2px ${alpha(theme.palette.primary.main, 0.2)}` : 'none',
      }}
    >
      {/* Column Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 2,
          py: 1.5,
          bgcolor: 'background.paper',
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        {onToggleCollapse && (
          <IconButton
            size="small"
            onClick={onToggleCollapse}
            sx={{ p: 0.25, color: 'text.secondary' }}
          >
            {isCollapsed ? <ChevronRight size={18} /> : <ChevronDown size={18} />}
          </IconButton>
        )}
        <Box
          sx={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            bgcolor: color,
            flexShrink: 0,
          }}
        />
        <Typography
          variant="subtitle2"
          sx={{
            fontWeight: 600,
            flex: 1,
          }}
        >
          {title}
        </Typography>
        <Chip
          label={emails.length}
          size="small"
          sx={{
            height: 20,
            minWidth: 24,
            fontSize: '0.75rem',
            fontWeight: 500,
            bgcolor: alpha(color, 0.1),
            color: color,
            '& .MuiChip-label': { px: 0.75 },
          }}
        />
        {unreadCount > 0 && (
          <Chip
            label={`${unreadCount} unread`}
            size="small"
            color="primary"
            variant="outlined"
            sx={{
              height: 18,
              fontSize: '0.625rem',
              '& .MuiChip-label': { px: 0.5 },
            }}
          />
        )}
      </Box>

      {/* Droppable area */}
      <Collapse in={!isCollapsed}>
        <Box
          ref={setNodeRef}
          sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
            p: 1,
            minHeight: 200,
            maxHeight: 'calc(100vh - 280px)',
            overflowY: 'auto',
            bgcolor: isOver ? alpha(theme.palette.primary.main, 0.05) : 'transparent',
            transition: 'background-color 0.2s',
          }}
        >
          <SortableContext items={emailIds} strategy={verticalListSortingStrategy}>
            {emails.length > 0 ? (
              emails.map((email) => (
                <EmailKanbanCard
                  key={email.id}
                  email={email}
                  onClick={onEmailClick}
                  onReply={onEmailReply}
                  onArchive={onEmailArchive}
                />
              ))
            ) : (
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  py: 4,
                  color: 'text.disabled',
                }}
              >
                <Typography variant="body2" color="inherit">
                  {t.email?.kanban?.emptyColumn || 'No emails'}
                </Typography>
                <Typography variant="caption" color="inherit" sx={{ mt: 0.5 }}>
                  {t.email?.kanban?.dragHint || 'Drag emails here'}
                </Typography>
              </Box>
            )}
          </SortableContext>
        </Box>
      </Collapse>
    </Box>
  );
});

export default EmailKanbanColumn;
