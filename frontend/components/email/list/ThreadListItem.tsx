import React, { useMemo } from 'react';
import { ListItemButton, Box, Typography, Checkbox, useMediaQuery, useTheme, IconButton } from '@mui/material';
import { Paperclip, Star, Reply } from 'lucide-react';
import type { Email } from '@/stores/email-store';
import type { Conversation } from '@/lib/api/email';
import { useTranslations } from '@/lib/hooks/use-translations';
import { parseEmailFrom, formatListDate } from '../shared/utils';
import { SearchHighlight } from '@/components/ui/SearchHighlight';

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
 * Refactored to match user screenshot:
 * - No Avatar.
 * - Light Gray Selection (No blue border).
 * - Compact 2-line layout.
 * - Purple Reply arrows.
 */
export const ThreadListItem = React.memo<ThreadListItemProps>(
  ({
    thread,
    selected = false,
    multiSelected = false,
    onToggleSelect,
    onToggleStar,
    // getProviderIcon, // Unused
    onClick,
    searchQuery,
  }) => {
    const t = useTranslations();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
    const [isHovered, setIsHovered] = React.useState(false);

    // Extract common properties
    const { threadId, emailId, from, subject, receivedAt, isRead, isStarred, hasAttachments, folder } =
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
            folder: thread.folder,
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
            folder: undefined,
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

    // Check if "Sent" folder logic applies (italic gray name)
    const isSent = folder === 'SENT' || folder === 'sentitems';

    return (
      <Box
        onMouseEnter={() => !isMobile && setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        sx={{
          position: 'relative',
          borderBottom: '1px solid',
          borderColor: 'divider',
          bgcolor: selected ? 'action.selected' : 'background.paper',
          transition: 'background-color 0.1s ease',
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
          disableRipple
          sx={{
            py: 1,
            px: 2,
            display: 'flex',
            gap: 1.5,
            alignItems: 'flex-start',
            bgcolor: 'transparent',
            cursor: 'pointer',
            minHeight: 56,
            '&.Mui-selected': {
              bgcolor: 'transparent',
              '&:hover': { bgcolor: 'transparent' },
            },
          }}
        >
          {/* Checkbox (Hidden unless hovered/selected) */}
          {(isHovered || multiSelected) && onToggleSelect ? (
            <Box
              onClick={(e) => e.stopPropagation()}
              sx={{
                width: 20,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                mt: 0.5,
                mr: -1
              }}
            >
              <Checkbox
                checked={multiSelected}
                onChange={(e) => {
                  e.stopPropagation();
                  handleToggleSelect();
                }}
                size="small"
                sx={{ p: 0 }}
              />
            </Box>
          ) : (
            // Unread Indicator - Blue Bar
            isRead === false && (
              <Box
                sx={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: 4,
                  bgcolor: 'primary.main',
                }}
              />
            )
          )}

          {/* Content Column */}
          <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 0 }}>

            {/* Row 1: Sender Name + Date */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <Typography
                variant="body2"
                sx={{
                  fontWeight: isRead ? 400 : 700,
                  fontStyle: isSent ? 'italic' : 'normal',
                  color: isSent ? 'text.secondary' : 'text.primary',
                  fontSize: '0.9rem',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  mr: 1
                }}
              >
                {fromData.name || t.common.unnamedContact}
              </Typography>

              <Typography
                variant="caption"
                sx={{
                  fontSize: '0.75rem',
                  color: isRead ? 'text.secondary' : 'primary.main',
                  fontWeight: isRead ? 400 : 600,
                  whiteSpace: 'nowrap',
                }}
              >
                {formatListDate(receivedAt)}
              </Typography>
            </Box>

            {/* Row 2: Subject + Icons */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 0.2 }}>
              <Typography
                variant="body2"
                sx={{
                  fontSize: '0.8125rem',
                  color: isSent ? 'text.disabled' : (subject ? 'text.secondary' : 'text.disabled'),
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  flex: 1,
                  mr: 1
                }}
              >
                <SearchHighlight
                  text={subject || t.common.noSubject}
                  query={searchQuery}
                  maxLength={50}
                />
              </Typography>

              {/* Icons Grid */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {hasAttachments && <Paperclip size={14} style={{ opacity: 0.6 }} />}

                {/* Reply Arrow visual (Purple) */}
                <Reply size={14} color="#7650ce" style={{ opacity: 0.8 }} />

                {onToggleStar && (
                  <IconButton
                    size="small"
                    onClick={handleToggleStar}
                    sx={{
                      p: 0,
                      ml: 0.5,
                      color: isStarred ? '#FFB300' : 'text.disabled',
                      '&:hover': { color: isStarred ? '#FFB300' : 'text.primary' },
                      opacity: isStarred ? 1 : 0
                    }}
                  >
                    {(isStarred || isHovered) && <Star size={14} fill={isStarred ? '#FFB300' : 'none'} />}
                  </IconButton>
                )}
              </Box>
            </Box>
          </Box>
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
