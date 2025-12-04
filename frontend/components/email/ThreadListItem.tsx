import React, { useMemo } from 'react';
import { ListItemButton, Box, Typography, Checkbox, Chip, Divider } from '@mui/material';
import { Paperclip, Users, Calendar as CalendarIcon } from 'lucide-react';
import type { Email } from '@/stores/email-store';
import type { Conversation } from '@/lib/api/email';
import { useTranslations } from '@/lib/hooks/use-translations';
import { ThreadActionBar, ThreadAvatar, ThreadLabels } from './shared';
import { parseEmailFrom, formatListDate } from './shared/utils';
import { SearchHighlight } from '../ui/SearchHighlight';

/**
 * Props for ThreadListItem component
 */
interface ThreadListItemProps {
  /**
   * Thread data (email or conversation)
   */
  thread: Email | Conversation;

  /**
   * Whether this thread is selected
   */
  selected?: boolean;

  /**
   * Whether this thread is multi-selected
   */
  multiSelected?: boolean;

  /**
   * Callback to toggle selection
   */
  onToggleSelect?: (id: string) => void;

  /**
   * Callback to toggle star
   */
  onToggleStar?: (id: string, isStarred: boolean) => void;

  /**
   * Callback to toggle important
   */
  onToggleImportant?: (id: string, isImportant: boolean) => void;

  /**
   * Callback to toggle read status
   */
  onToggleRead?: (id: string, isRead: boolean) => void;

  /**
   * Callback to archive
   */
  onArchive?: (id: string) => void;

  /**
   * Callback to delete
   */
  onDelete?: (id: string) => void;

  /**
   * Custom provider icon renderer
   */
  getProviderIcon?: (providerId: string) => React.ReactNode;

  /**
   * Callback when clicked
   */
  onClick?: () => void;

  /**
   * Search query to highlight in subject and snippet
   */
  searchQuery?: string;
}

/**
 * Type guard to check if thread is Email
 */
function isEmail(thread: Email | Conversation): thread is Email {
  return 'providerId' in thread;
}

/**
 * Type guard to check if thread is Conversation
 */
function isConversation(thread: Email | Conversation): thread is Conversation {
  return 'emailCount' in thread;
}

/**
 * ThreadListItem - Unified list item for emails and conversations
 *
 * Features:
 * - Supports both Email and Conversation types
 * - Floating action bar on hover
 * - Multi-selection support
 * - Optimized with React.memo
 * - Accessible with proper ARIA attributes
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

    // Extract common properties - use same ID logic as ThreadList
    // threadId: for UI/selection (thread.threadId || thread.id)
    // emailId: for API calls (thread.id)
    const { threadId, emailId, from, subject, snippet, receivedAt, isRead, isStarred, isImportant, emailLabels } =
      useMemo(() => {
        if (isEmail(thread)) {
          // For Email: threadId for UI, id for API
          const displayId = thread.threadId || thread.id;
          return {
            threadId: displayId,
            emailId: thread.id,
            from: thread.from,
            subject: thread.subject,
            snippet: thread.bodyPreview || '',
            receivedAt: thread.receivedAt,
            isRead: thread.isRead,
            isStarred: thread.isStarred || false,
            isImportant: thread.isImportant || false,
            emailLabels: thread.emailLabels || undefined,
          };
        } else {
          // For Conversation: use threadId for both (conversations don't have individual email operations)
          return {
            threadId: thread.threadId || '',
            emailId: thread.threadId || '',
            from: thread.from,
            subject: thread.subject,
            snippet: thread.snippet || '',
            receivedAt: thread.receivedAt,
            isRead: thread.isRead,
            isStarred: thread.isStarred || false,
            isImportant: false,
            emailLabels: undefined,
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

    const handleToggleStar = () => {
      onToggleStar?.(emailId, isStarred);
    };

    const handleToggleImportant = () => {
      onToggleImportant?.(emailId, isImportant);
    };

    const handleToggleRead = () => {
      onToggleRead?.(emailId, isRead);
    };

    const handleArchive = () => {
      onArchive?.(emailId);
    };

    const handleDelete = () => {
      onDelete?.(emailId);
    };

    const handleToggleSelect = () => {
      onToggleSelect?.(threadId);
    };

    // Convert emailLabels to ThreadLabels format
    const labelsData = useMemo(() => {
      if (!emailLabels || emailLabels.length === 0) return [];

      return emailLabels.map(el => ({
        id: el.label.id,
        name: el.label.name,
        color: el.label.color,
      }));
    }, [emailLabels]);

    // Get email count for conversations
    const emailCount = isConversation(thread) ? thread.emailCount : undefined;

    return (
      <>
        <Box
          sx={{
            position: 'relative',
            '&:hover .thread-action-bar': {
              opacity: 1,
              visibility: 'visible',
            },
          }}
        >
        <ListItemButton
          selected={selected}
          onClick={handleClick}
          sx={{
            py: { xs: 1.75, sm: 1.5 },
            px: { xs: 1.5, sm: 2 },
            display: 'flex',
            gap: { xs: 1.5, sm: 2 },
            alignItems: 'flex-start',
            bgcolor: isRead ? 'transparent' : 'action.hover',
            cursor: 'pointer',
            transition: 'background-color 0.2s ease',
            position: 'relative',
            minHeight: { xs: 72, sm: 'auto' },
            '&.Mui-selected': {
              bgcolor: 'action.selected',
            },
            '&:hover': {
              bgcolor: isRead ? 'action.hover' : 'action.selected',
            },
          }}
        >
          {/* Checkbox */}
          {onToggleSelect && (
            <Box
              onClick={(e) => {
                e.stopPropagation();
              }}
              onMouseDown={(e) => {
                e.stopPropagation();
              }}
            >
              <Checkbox
                checked={multiSelected}
                onChange={(e) => {
                  e.stopPropagation();
                  handleToggleSelect();
                }}
                sx={{
                  p: 0,
                  mt: 0.5,
                  width: { xs: 44, sm: 'auto' },
                  height: { xs: 44, sm: 'auto' },
                  color: 'action.active',
                  '&.Mui-checked': {
                    color: 'primary.main',
                  },
                  '& .MuiSvgIcon-root': {
                    fontSize: 20,
                  },
                }}
              />
            </Box>
          )}

          {/* Avatar */}
          <Box sx={{ mt: 0.5 }}>
            <ThreadAvatar
              email={fromData.email}
              name={fromData.name}
              providerIcon={isEmail(thread) ? getProviderIcon?.(thread.providerId) : undefined}
              isUnread={!isRead}
              size={40}
            />
          </Box>

          {/* Content */}
          <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            {/* From & Date */}
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
              <Typography
                variant="body2"
                sx={{
                  fontWeight: isRead ? 500 : 700,
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {fromData.name}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                {formatListDate(receivedAt)}
              </Typography>
            </Box>

            {/* Subject */}
            <Typography
              variant="body2"
              component="div"
              sx={{
                fontWeight: isRead ? 400 : 600,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              <SearchHighlight
                text={subject || '(No subject)'}
                query={searchQuery}
                maxLength={100}
              />
            </Typography>

            {/* Snippet */}
            <Typography
              variant="caption"
              component="div"
              color="text.secondary"
              sx={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              <SearchHighlight
                text={snippet}
                query={searchQuery}
                maxLength={150}
              />
            </Typography>

            {/* Metadata: Labels, Attachments, Thread Count */}
            <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5, flexWrap: 'wrap', alignItems: 'center' }}>
              <ThreadLabels labels={labelsData} maxVisible={3} size="small" />

              {isEmail(thread) && thread.hasAttachments && (
                <Chip
                  size="small"
                  icon={<Paperclip size={12} />}
                  label={t.dashboard.email.attachment}
                  sx={{ height: 18, fontSize: '0.65rem' }}
                />
              )}

              {isEmail(thread) && thread.hasCalendarInvite && (
                <Chip
                  size="small"
                  icon={<CalendarIcon size={12} />}
                  label="Invite"
                  sx={{ height: 18, fontSize: '0.65rem' }}
                  color="primary"
                />
              )}

              {emailCount && emailCount > 1 && (
                <Chip
                  size="small"
                  icon={<Users size={12} />}
                  label={`${emailCount}`}
                  sx={{ height: 18, fontSize: '0.65rem' }}
                />
              )}
            </Box>
          </Box>

        </ListItemButton>

        {/* Floating Action Bar - Centered horizontally */}
        {(onToggleRead || onToggleStar || onToggleImportant || onArchive || onDelete) && (
          <Box
            className="thread-action-bar"
            sx={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              opacity: 0,
              visibility: 'hidden',
              transition: 'opacity 0.2s ease, visibility 0.2s ease',
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
              position="top"
            />
          </Box>
        )}
        </Box>
        <Divider />
      </>
    );
  },
  (prevProps, nextProps) => {
    const prevThread = prevProps.thread;
    const nextThread = nextProps.thread;

    const prevId = 'threadId' in prevThread ? prevThread.threadId : prevThread.id;
    const nextId = 'threadId' in nextThread ? nextThread.threadId : nextThread.id;

    // Check if emailLabels changed (for Email type)
    const prevLabels = ('emailLabels' in prevThread ? prevThread.emailLabels : undefined) ?? [];
    const nextLabels = ('emailLabels' in nextThread ? nextThread.emailLabels : undefined) ?? [];
    const labelsChanged = prevLabels.length !== nextLabels.length ||
      prevLabels.some((pl, idx) => pl.label.id !== nextLabels[idx]?.label.id);

    return (
      prevId === nextId &&
      prevThread.isRead === nextThread.isRead &&
      prevThread.isStarred === nextThread.isStarred &&
      ('isImportant' in prevThread ? prevThread.isImportant : false) ===
        ('isImportant' in nextThread ? nextThread.isImportant : false) &&
      prevProps.selected === nextProps.selected &&
      prevProps.multiSelected === nextProps.multiSelected &&
      prevProps.searchQuery === nextProps.searchQuery &&
      !labelsChanged  // Re-render if labels changed
    );
  }
);

ThreadListItem.displayName = 'ThreadListItem';
