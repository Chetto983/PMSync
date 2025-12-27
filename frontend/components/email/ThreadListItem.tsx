import React, { useMemo } from 'react';
import { ListItemButton, Box, Typography, Checkbox, Fade, useMediaQuery, useTheme, IconButton, Tooltip } from '@mui/material';
import { Paperclip, Star } from 'lucide-react';
import type { Email } from '@/stores/email-store';
import type { Conversation } from '@/lib/api/email';
import { useTranslations } from '@/lib/hooks/use-translations';
import { ThreadAvatar } from './shared';
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
 * ThreadListItem - Outlook-style clean email list item
 *
 * Design principles (Outlook-inspired):
 * - Clean single-row layout with key info
 * - Checkbox visible on hover or when selected
 * - Star icon clickable inline
 * - NO floating action bar (actions in bulk bar or right-click)
 * - Subtle hover effects
 * - Clear unread indicator
 */
export const ThreadListItem = React.memo<ThreadListItemProps>(
  ({
    thread,
    selected = false,
    multiSelected = false,
    onToggleSelect,
    onToggleStar,
    getProviderIcon,
    onClick,
    searchQuery,
  }) => {
    const t = useTranslations();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
    const [isHovered, setIsHovered] = React.useState(false);

    // Extract common properties
    const { threadId, emailId, from, subject, receivedAt, isRead, isStarred, hasAttachments } =
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
            hasAttachments: false,
          };
        }
      }, [thread]);

    const fromData = useMemo(() => parseEmailFrom(from), [from]);

    const handleClick = (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest('.MuiCheckbox-root, .MuiIconButton-root')) {
        return;
      }
      onClick?.();
    };

    const handleToggleStar = (e: React.MouseEvent) => {
      e.stopPropagation();
      onToggleStar?.(emailId, isStarred);
    };

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
          borderBottom: 1,
          borderColor: 'divider',
          bgcolor: selected ? 'action.selected' : 'background.paper',
          transition: 'background-color 0.15s ease',
          '&:hover': {
            bgcolor: selected ? 'action.selected' : 'action.hover',
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
            py: 1,
            px: 1.5,
            display: 'flex',
            gap: 1,
            alignItems: 'center',
            bgcolor: 'transparent',
            cursor: 'pointer',
            minHeight: 52,
            '&.Mui-selected': {
              bgcolor: 'transparent',
              '&:hover': {
                bgcolor: 'transparent',
              },
            },
          }}
        >
          {/* Checkbox - visible on hover/selected */}
          {onToggleSelect && (
            <Box
              onClick={(e) => e.stopPropagation()}
              sx={{
                width: 24,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Fade in={showCheckbox || isMobile} timeout={100}>
                <Checkbox
                  checked={multiSelected}
                  onChange={(e) => {
                    e.stopPropagation();
                    handleToggleSelect();
                  }}
                  size="small"
                  sx={{
                    p: 0,
                    color: 'action.active',
                    '&.Mui-checked': {
                      color: 'primary.main',
                    },
                  }}
                />
              </Fade>
            </Box>
          )}

          {/* Unread indicator dot */}
          <Box
            sx={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              bgcolor: isRead ? 'transparent' : 'primary.main',
              flexShrink: 0,
            }}
          />

          {/* Avatar - Hidden on mobile */}
          {!isMobile && (
            <ThreadAvatar
              email={fromData.email}
              name={fromData.name}
              providerIcon={isEmail(thread) ? getProviderIcon?.(thread.providerId) : undefined}
              isUnread={!isRead}
              size={28}
            />
          )}

          {/* Content */}
          <Box sx={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 1, overflow: 'hidden' }}>
            {/* From */}
            <Typography
              variant="body2"
              sx={{
                fontWeight: isRead ? 400 : 600,
                width: { xs: 80, sm: 120, md: 160 },
                flexShrink: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontSize: '0.875rem',
                color: 'text.primary',
              }}
            >
              {fromData.name}
            </Typography>

            {/* Subject */}
            <Typography
              variant="body2"
              sx={{
                flex: 1,
                fontWeight: isRead ? 400 : 500,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontSize: '0.8125rem',
                color: subject ? 'text.secondary' : 'text.disabled',
                fontStyle: subject ? 'normal' : 'italic',
              }}
            >
              <SearchHighlight
                text={subject || t.common.noSubject}
                query={searchQuery}
                maxLength={isMobile ? 40 : 100}
              />
            </Typography>

            {/* Indicators */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
              {hasAttachments && (
                <Paperclip size={14} color={theme.palette.text.secondary} />
              )}
              {emailCount && emailCount > 1 && (
                <Typography
                  variant="caption"
                  sx={{
                    bgcolor: 'action.hover',
                    px: 0.5,
                    borderRadius: 0.5,
                    fontSize: '0.7rem',
                    fontWeight: 500,
                    color: 'text.secondary',
                  }}
                >
                  {emailCount}
                </Typography>
              )}
            </Box>

            {/* Date */}
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{
                flexShrink: 0,
                fontSize: '0.75rem',
                width: { xs: 45, sm: 60 },
                textAlign: 'right',
              }}
            >
              {formatListDate(receivedAt)}
            </Typography>
          </Box>

          {/* Star button - always visible */}
          {onToggleStar && (
            <Tooltip title={isStarred ? t.email.actions.unstar : t.email.actions.star}>
              <IconButton
                size="small"
                onClick={handleToggleStar}
                sx={{
                  p: 0.5,
                  color: isStarred ? '#FFB300' : 'action.disabled',
                  '&:hover': {
                    color: isStarred ? '#FFB300' : 'action.active',
                  },
                }}
              >
                <Star size={16} fill={isStarred ? '#FFB300' : 'none'} />
              </IconButton>
            </Tooltip>
          )}
        </ListItemButton>
      </Box>
    );
  },
  (prevProps, nextProps) => {
    const prevThread = prevProps.thread;
    const nextThread = nextProps.thread;

    const prevId = 'threadId' in prevThread ? prevThread.threadId : prevThread.id;
    const nextId = 'threadId' in nextThread ? nextThread.threadId : nextThread.id;

    return (
      prevId === nextId &&
      prevThread.isRead === nextThread.isRead &&
      prevThread.isStarred === nextThread.isStarred &&
      prevProps.selected === nextProps.selected &&
      prevProps.multiSelected === nextProps.multiSelected &&
      prevProps.searchQuery === nextProps.searchQuery
    );
  }
);

ThreadListItem.displayName = 'ThreadListItem';
