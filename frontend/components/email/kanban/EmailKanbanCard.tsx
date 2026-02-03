'use client';

/**
 * Email Kanban Card Component
 *
 * Draggable card for email workflow Kanban board.
 * Displays: sender avatar, subject, snippet preview, date.
 * Uses useSortable from @dnd-kit/sortable for drag-drop.
 */

import React, { memo, useCallback, MouseEvent } from 'react';
import {
  Box,
  Typography,
  Avatar,
  IconButton,
  Chip,
  Tooltip,
  useTheme,
} from '@mui/material';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Reply, Archive, Paperclip, Flag, GripVertical } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { stringToColor } from '@/lib/utils/gravatar';
import type { ThreadListItemData } from '../list/ThreadListItem';

interface EmailKanbanCardProps {
  email: ThreadListItemData;
  onReply?: (emailId: string) => void;
  onArchive?: (emailId: string) => void;
  onClick?: (emailId: string) => void;
  isDragging?: boolean;
}

export const EmailKanbanCard = memo(function EmailKanbanCard({
  email,
  onReply,
  onArchive,
  onClick,
  isDragging: isDraggingProp,
}: EmailKanbanCardProps) {
  const theme = useTheme();
  const t = useTranslations();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: email.id });

  const handleClick = useCallback(() => {
    onClick?.(email.id);
  }, [onClick, email.id]);

  const handleReply = useCallback((e: MouseEvent) => {
    e.stopPropagation();
    onReply?.(email.id);
  }, [onReply, email.id]);

  const handleArchive = useCallback((e: MouseEvent) => {
    e.stopPropagation();
    onArchive?.(email.id);
  }, [onArchive, email.id]);

  // Get initials for avatar fallback
  const getInitials = (name: string) => {
    const cleanName = name.split('<')[0].trim().replace(/^"|"$/g, '');
    const parts = cleanName.split(' ').filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return cleanName.slice(0, 2).toUpperCase();
  };

  // Format sender for display
  const formatSender = (from: string) => {
    const name = from.split('<')[0].trim().replace(/^"|"$/g, '');
    if (name) return name;
    return from;
  };

  const isActive = isDragging || isDraggingProp;

  return (
    <Box
      ref={setNodeRef}
      onClick={handleClick}
      sx={{
        transform: transform ? CSS.Transform.toString(transform) : undefined,
        transition,
        opacity: isActive ? 0.6 : 1,
        cursor: 'pointer',
        bgcolor: 'background.paper',
        borderRadius: 2,
        border: 1,
        borderColor: isActive ? 'primary.main' : 'divider',
        boxShadow: isActive ? 4 : 1,
        p: 1.5,
        position: 'relative',
        '&:hover': {
          borderColor: 'primary.light',
          boxShadow: 2,
          '& .kanban-card-actions': {
            opacity: 1,
          },
          '& .drag-handle': {
            opacity: 1,
          },
        },
      }}
      {...attributes}
    >
      {/* Drag handle */}
      <Box
        className="drag-handle"
        {...listeners}
        sx={{
          position: 'absolute',
          top: 8,
          left: 4,
          cursor: 'grab',
          opacity: 0,
          transition: 'opacity 0.2s',
          color: 'text.disabled',
          '&:active': {
            cursor: 'grabbing',
          },
        }}
      >
        <GripVertical size={16} />
      </Box>

      {/* Header: Avatar + Sender + Date */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, ml: 2 }}>
        <Avatar
          src={email.avatarUrl}
          sx={{
            width: 24,
            height: 24,
            fontSize: '0.625rem',
            bgcolor: email.avatarUrl ? undefined : stringToColor(email.from),
          }}
        >
          {getInitials(email.from)}
        </Avatar>
        <Typography
          variant="caption"
          sx={{
            fontWeight: email.isUnread ? 600 : 400,
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {formatSender(email.from)}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
          {email.date}
        </Typography>
      </Box>

      {/* Subject */}
      <Typography
        variant="body2"
        sx={{
          fontWeight: email.isUnread ? 500 : 400,
          fontSize: '0.8125rem',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          mb: 0.5,
          ml: 2,
        }}
      >
        {email.subject || t.common.noSubject}
      </Typography>

      {/* Snippet preview */}
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          fontSize: '0.75rem',
          lineHeight: 1.4,
          ml: 2,
        }}
      >
        {email.snippet}
      </Typography>

      {/* Indicators row */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 1, ml: 2 }}>
        {email.hasAttachments && (
          <Tooltip title={t.emailList?.hasAttachments || 'Has attachments'}>
            <Box sx={{ display: 'flex', alignItems: 'center', color: 'text.secondary' }}>
              <Paperclip size={12} />
            </Box>
          </Tooltip>
        )}
        {email.isFlagged && (
          <Flag
            size={12}
            fill={theme.palette.error.main}
            color={theme.palette.error.main}
          />
        )}
        {email.isUnread && (
          <Chip
            label="Unread"
            size="small"
            color="primary"
            sx={{
              height: 16,
              fontSize: '0.625rem',
              '& .MuiChip-label': { px: 0.5 },
            }}
          />
        )}
        {email.labels && email.labels.length > 0 && (
          <>
            {email.labels.slice(0, 2).map((label) => (
              <Chip
                key={label.id}
                label={label.name}
                size="small"
                sx={{
                  height: 16,
                  fontSize: '0.5625rem',
                  bgcolor: label.color,
                  color: 'white',
                  '& .MuiChip-label': { px: 0.5 },
                }}
              />
            ))}
          </>
        )}
      </Box>

      {/* Hover actions */}
      <Box
        className="kanban-card-actions"
        sx={{
          position: 'absolute',
          top: 4,
          right: 4,
          display: 'flex',
          gap: 0.5,
          opacity: 0,
          transition: 'opacity 0.2s',
          bgcolor: 'background.paper',
          borderRadius: 1,
          p: 0.25,
        }}
      >
        {onReply && (
          <Tooltip title={t.email?.view?.reply || 'Reply'}>
            <IconButton size="small" onClick={handleReply} sx={{ p: 0.25 }}>
              <Reply size={14} />
            </IconButton>
          </Tooltip>
        )}
        {onArchive && (
          <Tooltip title={t.emailList?.archive || 'Archive'}>
            <IconButton size="small" onClick={handleArchive} sx={{ p: 0.25 }}>
              <Archive size={14} />
            </IconButton>
          </Tooltip>
        )}
      </Box>
    </Box>
  );
});

export default EmailKanbanCard;
