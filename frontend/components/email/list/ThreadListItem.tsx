/**
 * Thread List Item Component
 *
 * Single email row with 3-line layout (Outlook-inspired):
 * Line 1: Avatar + Sender + Labels + Date
 * Line 2: Subject
 * Line 3: Snippet
 *
 * Features:
 * - Checkbox (hidden until hover)
 * - Action buttons on hover (star, archive, delete)
 * - Unread indicator
 * - Optimized with React.memo
 */

import { memo, MouseEvent } from 'react';
import {
  Box,
  Checkbox,
  Typography,
  Avatar,
  IconButton,
  Chip,
  Fade,
} from '@mui/material';
import { Star, Paperclip, Archive, Trash2 } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';

export interface ThreadListItemData {
  id: string;
  from: string;
  subject: string;
  snippet: string;
  date: string;
  isUnread: boolean;
  isStarred: boolean;
  hasAttachments: boolean;
  threadCount?: number;
  labels?: { id: string; name: string; color: string }[];
  avatarUrl?: string;
}

interface ThreadListItemProps {
  thread: ThreadListItemData;
  isSelected: boolean;
  isHovered: boolean;
  onSelect: (id: string, checked: boolean) => void;
  onClick: (id: string) => void;
  onStar: (id: string) => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

/**
 * Single email row with 3-line layout and hover actions
 *
 * Performance optimized with React.memo - only re-renders
 * when props change
 */
export const ThreadListItem = memo(function ThreadListItem({
  thread,
  isSelected,
  isHovered,
  onSelect,
  onClick,
  onStar,
  onArchive,
  onDelete,
  onMouseEnter,
  onMouseLeave,
}: ThreadListItemProps) {
  const t = useTranslations();

  const handleCheckboxChange = (e: MouseEvent) => {
    e.stopPropagation();
    onSelect(thread.id, !isSelected);
  };

  const handleRowClick = () => {
    onClick(thread.id);
  };

  const handleStar = (e: MouseEvent) => {
    e.stopPropagation();
    onStar(thread.id);
  };

  const handleArchive = (e: MouseEvent) => {
    e.stopPropagation();
    onArchive(thread.id);
  };

  const handleDelete = (e: MouseEvent) => {
    e.stopPropagation();
    onDelete(thread.id);
  };

  // Get initials for avatar fallback
  const getInitials = (name: string) => {
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  return (
    <Box
      onClick={handleRowClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        px: 2,
        py: 1.5,
        minHeight: 96,
        cursor: 'pointer',
        bgcolor: thread.isUnread
          ? 'rgba(25, 118, 210, 0.04)'
          : isSelected
            ? 'action.selected'
            : 'transparent',
        transition: 'background-color 0.15s ease',
        borderBottom: 1,
        borderColor: 'divider',
        '&:hover': {
          bgcolor: isSelected ? 'action.selected' : 'action.hover',
        },
      }}
    >
      {/* Checkbox - hidden until hover or selected */}
      <Fade in={isHovered || isSelected}>
        <Box sx={{ width: 40, flexShrink: 0 }}>
          <Checkbox
            checked={isSelected}
            onClick={handleCheckboxChange}
            size="small"
            sx={{ p: 0.5 }}
          />
        </Box>
      </Fade>

      {/* Avatar - small 28px */}
      <Avatar
        src={thread.avatarUrl}
        sx={{
          width: 28,
          height: 28,
          fontSize: '0.75rem',
          flexShrink: 0,
        }}
      >
        {getInitials(thread.from)}
      </Avatar>

      {/* Content - 3 lines */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        {/* Line 1: Sender + Labels + Date */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            mb: 0.5,
          }}
        >
          {/* Sender */}
          <Typography
            variant="body2"
            sx={{
              fontWeight: thread.isUnread ? 600 : 400,
              fontSize: '0.875rem',
              flexShrink: 1,
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {thread.from}
          </Typography>

          {/* Labels */}
          {thread.labels && thread.labels.length > 0 && (
            <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0 }}>
              {thread.labels.slice(0, 2).map((label) => (
                <Chip
                  key={label.id}
                  label={label.name}
                  size="small"
                  sx={{
                    height: 18,
                    fontSize: '0.6875rem',
                    bgcolor: label.color,
                    color: 'white',
                    '& .MuiChip-label': { px: 0.75 },
                  }}
                />
              ))}
            </Box>
          )}

          {/* Indicators */}
          <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center', flexShrink: 0 }}>
            {thread.hasAttachments && (
              <Paperclip
                size={14}
                strokeWidth={2}
                style={{ color: 'var(--mui-palette-text-secondary)' }}
              />
            )}
            {thread.threadCount && thread.threadCount > 1 && (
              <Chip
                label={thread.threadCount}
                size="small"
                sx={{
                  height: 18,
                  fontSize: '0.6875rem',
                  '& .MuiChip-label': { px: 0.75 },
                }}
              />
            )}
          </Box>

          {/* Date */}
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{
              fontSize: '0.75rem',
              flexShrink: 0,
              ml: 'auto',
            }}
          >
            {thread.date}
          </Typography>
        </Box>

        {/* Line 2: Subject */}
        <Typography
          variant="body2"
          color="text.primary"
          sx={{
            fontWeight: thread.isUnread ? 500 : 400,
            fontSize: '0.8125rem',
            mb: 0.25,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {thread.subject || t.common.noSubject}
        </Typography>

        {/* Line 3: Snippet */}
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{
            fontSize: '0.8125rem',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {thread.snippet}
        </Typography>
      </Box>

      {/* Action buttons - show on hover */}
      <Fade in={isHovered}>
        <Box
          sx={{
            display: 'flex',
            gap: 0.5,
            flexShrink: 0,
          }}
        >
          {/* Star */}
          <IconButton
            size="small"
            onClick={handleStar}
            sx={{ p: 0.5 }}
            aria-label={thread.isStarred ? t.emailList.unstarred : t.emailList.starred}
          >
            <Star
              size={18}
              fill={thread.isStarred ? '#FFB300' : 'none'}
              stroke={thread.isStarred ? '#FFB300' : 'currentColor'}
              strokeWidth={2}
            />
          </IconButton>

          {/* Archive */}
          <IconButton
            size="small"
            onClick={handleArchive}
            sx={{ p: 0.5 }}
            aria-label={t.emailList.archive}
          >
            <Archive size={18} strokeWidth={2} />
          </IconButton>

          {/* Delete */}
          <IconButton
            size="small"
            onClick={handleDelete}
            sx={{ p: 0.5, color: 'error.main' }}
            aria-label={t.emailList.delete}
          >
            <Trash2 size={18} strokeWidth={2} />
          </IconButton>
        </Box>
      </Fade>
    </Box>
  );
});

export default ThreadListItem;
