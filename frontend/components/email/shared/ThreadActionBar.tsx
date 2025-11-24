import React from 'react';
import { Box, IconButton, Tooltip, Fade } from '@mui/material';
import { Star, Flag, Archive, Trash2, Mail, MailOpen } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';

/**
 * Props for ThreadActionBar component
 */
export interface ThreadActionBarProps {
  /**
   * Whether the thread is read
   */
  isRead: boolean;

  /**
   * Whether the thread is starred
   */
  isStarred: boolean;

  /**
   * Whether the thread is marked as important
   */
  isImportant: boolean;

  /**
   * Callback to toggle read status
   */
  onToggleRead: () => void;

  /**
   * Callback to toggle star status
   */
  onToggleStar: () => void;

  /**
   * Callback to toggle important status
   */
  onToggleImportant: () => void;

  /**
   * Callback to archive the thread
   */
  onArchive: () => void;

  /**
   * Callback to delete the thread
   */
  onDelete: () => void;

  /**
   * Whether to show on hover only
   * @default true
   */
  showOnHover?: boolean;

  /**
   * Whether the item is currently being hovered
   */
  isHovered?: boolean;

  /**
   * Position of the action bar (top or center of the item)
   * @default 'center'
   */
  position?: 'top' | 'center';
}

/**
 * ThreadActionBar - Floating action bar with quick actions
 *
 * Features:
 * - Appears on hover (optional)
 * - Four quick actions: Star, Important, Archive, Delete
 * - Tooltips for each action
 * - Smooth animations
 * - Optimistic updates ready
 * - Internationalization support
 *
 * @example
 * ```tsx
 * <ThreadActionBar
 *   isStarred={email.isStarred}
 *   isImportant={email.isImportant}
 *   onToggleStar={() => handleToggleStar(email.id)}
 *   onToggleImportant={() => handleToggleImportant(email.id)}
 *   onArchive={() => handleArchive(email.id)}
 *   onDelete={() => handleDelete(email.id)}
 *   showOnHover
 *   position="center"
 * />
 * ```
 */
export const ThreadActionBar: React.FC<ThreadActionBarProps> = ({
  isRead,
  isStarred,
  isImportant,
  onToggleRead,
  onToggleStar,
  onToggleImportant,
  onArchive,
  onDelete,
  showOnHover = true,
  isHovered = false,
  position = 'center',
}) => {
  const t = useTranslations();

  const handleReadClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleRead();
  };

  const handleStarClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleStar();
  };

  const handleImportantClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleImportant();
  };

  const handleArchiveClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onArchive();
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete();
  };

  const shouldShow = showOnHover ? isHovered : true;

  // Don't render at all if not visible
  if (!shouldShow) {
    return null;
  }

  return (
    <Fade in={shouldShow} timeout={200}>
      <Box
        sx={{
          position: 'absolute',
          right: 8,
          top: position === 'top' ? 8 : '50%',
          transform: position === 'center' ? 'translateY(-50%)' : 'none',
          zIndex: 10,
          display: 'flex',
          gap: 0.5,
          bgcolor: 'background.paper',
          borderRadius: 1.5,
          border: '1px solid',
          borderColor: 'divider',
          boxShadow: 2,
          p: 0.5,
          transition: 'all 0.2s ease',
          pointerEvents: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Read/Unread Button */}
        <Tooltip
          title={isRead ? t.dashboard.email.bulkBar.markUnread : t.dashboard.email.bulkBar.markRead}
          arrow
          placement="top"
        >
          <IconButton
            size="small"
            onClick={handleReadClick}
            sx={{
              width: 28,
              height: 28,
              '&:hover': {
                bgcolor: 'action.hover',
              },
            }}
          >
            {isRead ? (
              <Mail size={16} color="currentColor" />
            ) : (
              <MailOpen size={16} color="currentColor" />
            )}
          </IconButton>
        </Tooltip>

        {/* Star Button */}
        <Tooltip
          title={isStarred ? t.dashboard.email.bulkBar.removeStar : t.dashboard.email.bulkBar.addStar}
          arrow
          placement="top"
        >
          <IconButton
            size="small"
            onClick={handleStarClick}
            sx={{
              width: 28,
              height: 28,
              '&:hover': {
                bgcolor: isStarred ? 'warning.light' : 'action.hover',
              },
            }}
          >
            <Star
              size={16}
              fill={isStarred ? '#FFB300' : 'none'}
              color={isStarred ? '#FFB300' : 'currentColor'}
            />
          </IconButton>
        </Tooltip>

        {/* Important Button */}
        <Tooltip
          title={t.dashboard.email.quickFilters.important}
          arrow
          placement="top"
        >
          <IconButton
            size="small"
            onClick={handleImportantClick}
            sx={{
              width: 28,
              height: 28,
              '&:hover': {
                bgcolor: isImportant ? 'warning.light' : 'action.hover',
              },
            }}
          >
            <Flag
              size={16}
              fill={isImportant ? '#FF9800' : 'none'}
              color={isImportant ? '#FF9800' : 'currentColor'}
            />
          </IconButton>
        </Tooltip>

        {/* Archive Button */}
        <Tooltip
          title={t.dashboard.email.bulkBar.archive}
          arrow
          placement="top"
        >
          <IconButton
            size="small"
            onClick={handleArchiveClick}
            sx={{
              width: 28,
              height: 28,
              '&:hover': {
                bgcolor: 'action.hover',
              },
            }}
          >
            <Archive size={16} color="currentColor" />
          </IconButton>
        </Tooltip>

        {/* Delete Button */}
        <Tooltip
          title={t.dashboard.email.bulkBar.delete}
          arrow
          placement="top"
        >
          <IconButton
            size="small"
            onClick={handleDeleteClick}
            sx={{
              width: 28,
              height: 28,
              '&:hover': {
                bgcolor: 'error.light',
              },
            }}
          >
            <Trash2 size={16} color="#d32f2f" />
          </IconButton>
        </Tooltip>
      </Box>
    </Fade>
  );
};
