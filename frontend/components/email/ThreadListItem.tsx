import React, { useMemo } from 'react';
import { ListItemButton, Box, Typography, Checkbox, Fade, useMediaQuery, useTheme } from '@mui/material';
import { Paperclip, Star } from 'lucide-react';
import type { Email } from '@/stores/email-store';
import type { Conversation } from '@/lib/api/email';
import { useTranslations } from '@/lib/hooks/use-translations';
import { ThreadActionBar, ThreadAvatar } from './shared';
import { parseEmailFrom, formatListDate } from './shared/utils';
import { SearchHighlight } from '../ui/SearchHighlight';

/**
 * Props for ThreadListItem component
 */
interface ThreadListItemProps {
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
  isExpanded?: boolean;
  onToggleExpand?: (threadId: string) => void;
}

/**
 * Type guard to check if thread is Email
 */
function isEmail(thread: Email | Conversation): thread is Email {
  return 'providerId' in thread;
}

/**
 * ThreadListItem - Modern, clean email list item (Superhuman/shadcn inspired)
 *
 * Design principles:
 * - Clean 2-line layout: sender+date, subject only
 * - Checkbox hidden until hover (clean look)
 * - Small avatar (28px)
 * - No snippet preview (minimal clutter)
 * - Subtle hover effects
 * - Floating action bar on hover
 */
export const ThreadListItem = React.memo<ThreadListItemProps>(
  ({
    thread,
    selected = false,
    multiSelected = false,
    onToggleSelect,
    onToggleStar,
    onToggleImportant,
    onToggleRead,
    onArchive,
    onDelete,
    getProviderIcon,
    onClick,
    searchQuery,
  }) => {
    const t = useTranslations();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
    const [isHovered, setIsHovered] = React.useState(false);

    // Extract common properties
    const { threadId, emailId, from, subject, receivedAt, isRead, isStarred, isImportant, hasAttachments } =
      useMemo(() => {
        if (isEmail(thread)) {
          const displayId = thread.threadId || thread.id;
          return {
            threadId: displayId,
            emailId: thread.id,
            from: thread.from,
            subject: thread.subject,
            receivedAt: thread.receivedAt,
            isRead: thread.isRead,
            isStarred: thread.isStarred || false,
            isImportant: thread.isImportant ?? thread.isFlagged ?? false,
            hasAttachments: thread.hasAttachments || false,
          };
        } else {
          return {
            threadId: thread.threadId || '',
            emailId: thread.latestEmailId || thread.threadId || '',
            from: thread.from,
            subject: thread.subject,
            receivedAt: thread.receivedAt,
            isRead: thread.isRead,
            isStarred: thread.isStarred || false,
            isImportant: thread.isFlagged || false,
            hasAttachments: false,
          };
        }
      }, [thread]);

    const fromData = useMemo(() => parseEmailFrom(from), [from]);

    const handleClick = (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest('.MuiCheckbox-root')) {
        return;
      }
      onClick?.();
    };

    const handleToggleStar = () => onToggleStar?.(emailId, isStarred);
    const handleToggleImportant = () => onToggleImportant?.(emailId, isImportant);
    const handleToggleRead = () => onToggleRead?.(emailId, isRead);
    const handleArchive = () => onArchive?.(emailId);
    const handleDelete = () => onDelete?.(emailId);
    const handleToggleSelect = () => onToggleSelect?.(threadId);

    // Email count for thread indicator
    const emailCount = thread.emailCount;

    // Show checkbox on hover or when selected
    const showCheckbox = isHovered || multiSelected;

    return (
      <Box
        onMouseEnter={() => !isMobile && setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        sx={{
          position: 'relative',
          borderBottom: '1px solid',
          borderColor: 'divider',
          transition: 'all 0.15s ease',
          overflow: 'hidden',
          maxWidth: '100%',
          // Unread indicator - left border
          borderLeft: isRead ? 'none' : '3px solid',
          borderLeftColor: isRead ? 'transparent' : 'primary.main',
          '&:hover': {
            bgcolor: isMobile ? 'transparent' : 'action.hover',
          },
        }}
      >
        <ListItemButton
          selected={selected}
          onClick={handleClick}
          data-testid="thread-list-item"
          data-thread-id={threadId}
          data-email-id={emailId}
          sx={{
            py: isMobile ? 0.75 : 1,
            px: isMobile ? 1 : 1.5,
            display: 'flex',
            gap: isMobile ? 1 : 1.5,
            alignItems: 'center',
            bgcolor: isRead ? 'transparent' : 'rgba(25, 118, 210, 0.08)',
            cursor: 'pointer',
            minHeight: isMobile ? 48 : 56,
            maxWidth: '100%',
            overflow: 'hidden',
            '&.Mui-selected': {
              bgcolor: 'action.selected',
              '&:hover': {
                bgcolor: 'action.selected',
              },
            },
          }}
        >
          {/* Checkbox - Hidden on mobile, only visible on hover for desktop */}
          {onToggleSelect && !isMobile && (
            <Box
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              sx={{
                width: 24,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Fade in={showCheckbox} timeout={150}>
                <Checkbox
                  checked={multiSelected}
                  onChange={(e) => {
                    e.stopPropagation();
                    handleToggleSelect();
                  }}
                  sx={{
                    p: 0,
                    opacity: showCheckbox ? 1 : 0,
                    color: 'action.active',
                    '&.Mui-checked': {
                      color: 'primary.main',
                    },
                    '& .MuiSvgIcon-root': {
                      fontSize: 16,
                    },
                  }}
                />
              </Fade>
            </Box>
          )}

          {/* Avatar - Hidden on mobile for compact view, 24px on desktop */}
          {!isMobile && (
            <ThreadAvatar
              email={fromData.email}
              name={fromData.name}
              providerIcon={isEmail(thread) ? getProviderIcon?.(thread.providerId) : undefined}
              isUnread={!isRead}
              size={24}
            />
          )}

          {/* Content - Responsive 2-line layout */}
          <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 0.125, overflow: 'hidden' }}>
            {/* Line 1: Sender + Date */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
              <Typography
                variant="body2"
                sx={{
                  fontWeight: isRead ? 400 : 600,
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  fontSize: isMobile ? '0.8125rem' : '0.875rem',
                  color: 'text.primary',
                  minWidth: 0,
                }}
              >
                {fromData.name}
              </Typography>

              {/* Indicators: Star, Attachment, Thread count - smaller on mobile */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, flexShrink: 0 }}>
                {isStarred && (
                  <Star size={isMobile ? 12 : 14} fill="#FFB300" color="#FFB300" />
                )}
                {hasAttachments && (
                  <Paperclip size={isMobile ? 12 : 14} color="#9e9e9e" />
                )}
                {emailCount && emailCount > 1 && (
                  <Typography
                    variant="caption"
                    sx={{
                      bgcolor: 'action.hover',
                      px: 0.5,
                      py: 0,
                      borderRadius: 0.5,
                      fontSize: '0.65rem',
                      fontWeight: 500,
                      color: 'text.secondary',
                      lineHeight: 1.4,
                    }}
                  >
                    {emailCount}
                  </Typography>
                )}
              </Box>

              <Typography
                variant="caption"
                color="text.secondary"
                sx={{
                  flexShrink: 0,
                  fontSize: isMobile ? '0.7rem' : '0.75rem',
                }}
              >
                {formatListDate(receivedAt)}
              </Typography>
            </Box>

            {/* Line 2: Subject only */}
            <Typography
              variant="body2"
              component="div"
              sx={{
                fontWeight: isRead ? 400 : 500,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontSize: isMobile ? '0.75rem' : '0.8125rem',
                color: subject ? 'text.secondary' : 'text.disabled',
                fontStyle: subject ? 'normal' : 'italic',
                lineHeight: 1.3,
              }}
            >
              <SearchHighlight
                text={subject || t.common.noSubject}
                query={searchQuery}
                maxLength={isMobile ? 60 : 120}
              />
            </Typography>
          </Box>
        </ListItemButton>

        {/* Floating Action Bar - Hidden on mobile, appears on hover for desktop */}
        {!isMobile && isHovered && (onToggleRead || onToggleStar || onToggleImportant || onArchive || onDelete) && (
          <Box
            className="thread-action-bar"
            sx={{
              position: 'absolute',
              right: 16,
              top: '50%',
              transform: 'translateY(-50%)',
              zIndex: 10,
            }}
          >
            <ThreadActionBar
              isRead={isRead}
              isStarred={isStarred}
              isImportant={isImportant}
              onToggleRead={handleToggleRead}
              onToggleStar={handleToggleStar}
              onToggleImportant={handleToggleImportant}
              onArchive={handleArchive}
              onDelete={handleDelete}
              showOnHover={false}
              isHovered={true}
              position="center"
            />
          </Box>
        )}
      </Box>
    );
  },
  (prevProps, nextProps) => {
    const prevThread = prevProps.thread;
    const nextThread = nextProps.thread;

    const prevId = 'threadId' in prevThread ? prevThread.threadId : prevThread.id;
    const nextId = 'threadId' in nextThread ? nextThread.threadId : nextThread.id;

    const prevImportant =
      (prevThread as { isImportant?: boolean; isFlagged?: boolean }).isImportant ??
      (prevThread as { isImportant?: boolean; isFlagged?: boolean }).isFlagged ??
      false;

    const nextImportant =
      (nextThread as { isImportant?: boolean; isFlagged?: boolean }).isImportant ??
      (nextThread as { isImportant?: boolean; isFlagged?: boolean }).isFlagged ??
      false;

    return (
      prevId === nextId &&
      prevThread.isRead === nextThread.isRead &&
      prevThread.isStarred === nextThread.isStarred &&
      prevImportant === nextImportant &&
      prevProps.selected === nextProps.selected &&
      prevProps.multiSelected === nextProps.multiSelected &&
      prevProps.searchQuery === nextProps.searchQuery
    );
  }
);

ThreadListItem.displayName = 'ThreadListItem';
