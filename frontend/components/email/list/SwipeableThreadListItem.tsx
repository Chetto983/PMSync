/**
 * SwipeableThreadListItem Component
 *
 * Enhanced ThreadListItem with mobile swipe gestures
 * and improved animations for a modern email UX.
 *
 * Features:
 * - Swipe left to delete/archive
 * - Swipe right to mark as read/unread
 * - Visual feedback during swipe
 * - Haptic feedback support
 * - Smooth CSS animations
 */
import React, { useMemo } from 'react';
import { Box, alpha, useTheme, useMediaQuery } from '@mui/material';
import { Trash2, Mail, MailOpen } from 'lucide-react';
import { ThreadListItem } from './ThreadListItem';
import { useSwipeActions } from '@/hooks/use-swipe-actions';
import { useTranslations } from '@/lib/hooks/use-translations';
import type { Email } from '@/stores/email-store';
import type { Conversation } from '@/lib/api/email';

interface SwipeableThreadListItemProps {
  thread: Email | Conversation;
  selected?: boolean;
  multiSelected?: boolean;
  onToggleSelect?: (id: string) => void;
  onToggleStar?: (id: string, isStarred: boolean) => void;
  onToggleImportant?: (id: string, isImportant: boolean) => void;
  onToggleRead?: (id: string, isRead: boolean) => void;
  onArchive?: (id: string) => void;
  onDelete?: (id: string) => void;
  getProviderIcon?: (providerId: string) => React.ReactNode;
  onClick?: () => void;
  searchQuery?: string;
  /**
   * Enable swipe gestures (default: true on mobile)
   */
  enableSwipe?: boolean;
}

/**
 * Type guard for Email
 */
function isEmail(thread: Email | Conversation): thread is Email {
  return 'providerId' in thread;
}

interface SwipeLabels {
  delete: string;
  markRead: string;
  markUnread: string;
}

/**
 * Swipe action indicator component
 */
function SwipeIndicator({
  direction,
  progress,
  isRead,
  labels,
}: {
  direction: 'left' | 'right' | null;
  progress: number;
  isRead: boolean;
  labels: SwipeLabels;
}) {
  const theme = useTheme();

  if (!direction) return null;

  const isLeft = direction === 'left';
  const bgColor = isLeft
    ? alpha(theme.palette.error.main, Math.min(progress * 0.8, 0.8))
    : alpha(theme.palette.primary.main, Math.min(progress * 0.8, 0.8));

  const Icon = isLeft
    ? Trash2
    : isRead
      ? MailOpen
      : Mail;

  const label = isLeft ? labels.delete : isRead ? labels.markUnread : labels.markRead;

  return (
    <Box
      sx={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        [isLeft ? 'right' : 'left']: 0,
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: isLeft ? 'flex-end' : 'flex-start',
        px: 3,
        bgcolor: bgColor,
        color: 'white',
        transition: 'background-color 0.15s ease',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          opacity: Math.min(progress * 1.5, 1),
          transform: `scale(${0.8 + progress * 0.2})`,
          transition: 'transform 0.15s ease, opacity 0.15s ease',
        }}
      >
        <Icon size={20} />
        <Box
          component="span"
          sx={{
            fontWeight: 600,
            fontSize: '0.875rem',
          }}
        >
          {label}
        </Box>
      </Box>
    </Box>
  );
}

export const SwipeableThreadListItem: React.FC<SwipeableThreadListItemProps> = ({
  thread,
  selected,
  multiSelected,
  onToggleSelect,
  onToggleStar,
  onToggleImportant,
  onToggleRead,
  onArchive,
  onDelete,
  getProviderIcon,
  onClick,
  searchQuery,
  enableSwipe,
}) => {
  const theme = useTheme();
  const t = useTranslations();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const swipeLabels: SwipeLabels = {
    delete: t.email.swipe.delete,
    markRead: t.email.swipe.markRead,
    markUnread: t.email.swipe.markUnread,
  };

  // Extract email ID and read status
  const { emailId, isRead } = useMemo(() => {
    if (isEmail(thread)) {
      return {
        emailId: thread.id,
        isRead: thread.isRead,
      };
    }
    return {
      emailId: thread.threadId || '',
      isRead: thread.isRead,
    };
  }, [thread]);

  // Swipe handlers
  const handleSwipeLeft = () => {
    onDelete?.(emailId);
  };

  const handleSwipeRight = () => {
    onToggleRead?.(emailId, isRead);
  };

  // Use swipe hook
  const shouldEnableSwipe = enableSwipe ?? isMobile;
  const { state, handlers, style } = useSwipeActions({
    threshold: 80,
    enableLeft: shouldEnableSwipe && !!onDelete,
    enableRight: shouldEnableSwipe && !!onToggleRead,
    onSwipeLeft: handleSwipeLeft,
    onSwipeRight: handleSwipeRight,
    hapticFeedback: true,
  });

  // If swipe is disabled, just render the item
  if (!shouldEnableSwipe) {
    return (
      <ThreadListItem
        thread={thread}
        selected={selected}
        multiSelected={multiSelected}
        onToggleSelect={onToggleSelect}
        onToggleStar={onToggleStar}
        onToggleImportant={onToggleImportant}
        onToggleRead={onToggleRead}
        onArchive={onArchive}
        onDelete={onDelete}
        getProviderIcon={getProviderIcon}
        onClick={onClick}
        searchQuery={searchQuery}
      />
    );
  }

  return (
    <Box
      sx={{
        position: 'relative',
        overflow: 'hidden',
        // Subtle hover animation
        '&:hover': {
          '& .swipeable-content': {
            bgcolor: 'action.hover',
          },
        },
      }}
      {...handlers}
    >
      {/* Background swipe indicators */}
      <SwipeIndicator
        direction={state.direction}
        progress={state.progress}
        isRead={isRead}
        labels={swipeLabels}
      />

      {/* Main content */}
      <Box
        className="swipeable-content"
        sx={{
          position: 'relative',
          bgcolor: 'background.paper',
          ...style,
          // Add subtle shadow when swiping
          boxShadow: state.isSwiping ? 2 : 0,
          transition: state.isSwiping
            ? 'none'
            : 'transform 0.15s ease-out, box-shadow 0.15s ease',
        }}
      >
        <ThreadListItem
          thread={thread}
          selected={selected}
          multiSelected={multiSelected}
          onToggleSelect={onToggleSelect}
          onToggleStar={onToggleStar}
          onToggleImportant={onToggleImportant}
          onToggleRead={onToggleRead}
          onArchive={onArchive}
          onDelete={onDelete}
          getProviderIcon={getProviderIcon}
          onClick={onClick}
          searchQuery={searchQuery}
        />
      </Box>
    </Box>
  );
};

export default SwipeableThreadListItem;
