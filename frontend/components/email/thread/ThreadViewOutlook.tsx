/**
 * Thread View Component - New Outlook Style
 *
 * Displays an email conversation/thread matching Microsoft's New Outlook design:
 * - Subject header at top
 * - Collapsed messages: Avatar + Name + Preview + Date (single line)
 * - "See X more messages" expandable link
 * - Expanded message: Full card with To/CC, body, action bar
 * - Clean flat cards, not heavy accordions
 *
 * @see Reference: New Outlook for Windows 2024/2025
 */

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Box, Typography, IconButton, Button, Tooltip, Menu, MenuItem, Divider } from '@mui/material';
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Trash2,
  Archive,
  FolderInput,
  Tag,
  Mail,
  MailOpen,
  Flag,
  MoreHorizontal,
  Reply,
  Forward,
  ReplyAll,
} from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { CollapsedMessage } from './CollapsedMessage';
import { ExpandedMessage } from './ExpandedMessage';

export interface ThreadMessageData {
  id: string;
  from: string;
  to: string[];
  cc?: string[];
  date: string;
  subject: string;
  body: string;
  isUnread: boolean;
  isFlagged: boolean;
  hasAttachments: boolean;
  attachments?: Array<{ id: string; name: string; size: number; contentId?: string | null }>;
  avatarUrl?: string;
  isAutoReply?: boolean;
}

interface ThreadViewOutlookProps {
  threadId: string;
  subject: string;
  messages: ThreadMessageData[];
  onBack: () => void;
  onFlag: (messageId: string) => void;
  onReply: (messageId: string) => void;
  onReplyAll?: (messageId: string) => void;
  onForward: (messageId: string) => void;
  /** Callback when attachment download is clicked */
  onDownloadAttachment?: (messageId: string, attachmentId: string) => void;
  onDeleteThread?: () => void;
  onMoveThread?: () => void;
  onArchiveThread?: () => void;
  onMarkThreadRead?: () => void;
  onMarkThreadUnread?: () => void;
  onFlagAllMessages?: () => void;
  onUnflagAllMessages?: () => void;
  onAddLabelsToThread?: () => void;
  /** Callback for adding labels to a single message */
  onLabelsMessage?: (messageId: string) => void;
}

// Re-export as ThreadView for backward compatibility
export { ThreadViewOutlook as ThreadView };

export function ThreadViewOutlook({
  threadId: _threadId,
  subject,
  messages,
  onBack,
  onFlag,
  onReply,
  onReplyAll,
  onForward,
  onDownloadAttachment,
  onDeleteThread,
  onMoveThread,
  onArchiveThread,
  onMarkThreadRead,
  onMarkThreadUnread,
  onFlagAllMessages,
  onUnflagAllMessages,
  onAddLabelsToThread,
  onLabelsMessage,
}: ThreadViewOutlookProps) {
  const t = useTranslations();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Menu state
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const menuOpen = Boolean(anchorEl);

  // Expanded message ID (only one at a time, like Outlook)
  // Default: most recent message (last in array)
  const [expandedId, setExpandedId] = useState<string | null>(
    messages.length > 0 ? messages[messages.length - 1].id : null
  );

  // Middle messages collapsed state (Outlook's "See X more messages")
  const [middleExpanded, setMiddleExpanded] = useState(false);

  // Separate messages into: first, middle (collapsible), last
  const { firstMessage, middleMessages, lastMessage } = useMemo(() => {
    if (messages.length <= 2) {
      return {
        firstMessage: messages[0] || null,
        middleMessages: [],
        lastMessage: messages.length > 1 ? messages[messages.length - 1] : null,
      };
    }
    return {
      firstMessage: messages[0],
      middleMessages: messages.slice(1, -1),
      lastMessage: messages[messages.length - 1],
    };
  }, [messages]);

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleAction = (action?: () => void) => {
    handleMenuClose();
    action?.();
  };

  const handleMessageClick = useCallback((messageId: string) => {
    setExpandedId((prev) => (prev === messageId ? null : messageId));
  }, []);

  const handleExpandAll = useCallback(() => {
    setMiddleExpanded(true);
  }, []);

  const handleCollapseAll = useCallback(() => {
    setMiddleExpanded(false);
    setExpandedId(null);
  }, []);

  // Scroll to bottom when thread opens (show most recent)
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        bgcolor: 'background.default',
      }}
    >
      {/* Thread Header - Outlook Style */}
      <Box
        sx={{
          bgcolor: 'background.paper',
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        {/* Subject Row */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            px: 2,
            py: 1.5,
          }}
        >
          <IconButton
            size="small"
            onClick={onBack}
            aria-label={t.common.close}
            sx={{ minWidth: 44, minHeight: 44 }}
          >
            <ArrowLeft size={20} />
          </IconButton>

          <Typography
            variant="h6"
            sx={{
              flex: 1,
              fontSize: '1.125rem',
              fontWeight: 600,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {subject}
          </Typography>

          {/* Toolbar Actions */}
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <Tooltip title={t.threadMessage?.reply || 'Reply'}>
              <IconButton
                size="small"
                onClick={() => expandedId && onReply(expandedId)}
                disabled={!expandedId}
                sx={{ minWidth: 44, minHeight: 44 }}
              >
                <Reply size={18} />
              </IconButton>
            </Tooltip>
            {onReplyAll && (
              <Tooltip title={t.threadMessage?.replyAll || 'Reply All'}>
                <IconButton
                  size="small"
                  onClick={() => expandedId && onReplyAll(expandedId)}
                  disabled={!expandedId}
                  sx={{ minWidth: 44, minHeight: 44 }}
                >
                  <ReplyAll size={18} />
                </IconButton>
              </Tooltip>
            )}
            <Tooltip title={t.threadMessage?.forward || 'Forward'}>
              <IconButton
                size="small"
                onClick={() => expandedId && onForward(expandedId)}
                disabled={!expandedId}
                sx={{ minWidth: 44, minHeight: 44 }}
              >
                <Forward size={18} />
              </IconButton>
            </Tooltip>

            <Divider orientation="vertical" flexItem sx={{ mx: 0.5, height: 24, alignSelf: 'center' }} />

            {onArchiveThread && (
              <Tooltip title={t.threadActions?.archiveThread || 'Archive'}>
                <IconButton size="small" onClick={onArchiveThread} sx={{ minWidth: 44, minHeight: 44 }}>
                  <Archive size={18} />
                </IconButton>
              </Tooltip>
            )}
            {onMoveThread && (
              <Tooltip title={t.threadActions?.moveThread || 'Move to folder'}>
                <IconButton size="small" onClick={onMoveThread} sx={{ minWidth: 44, minHeight: 44 }}>
                  <FolderInput size={18} />
                </IconButton>
              </Tooltip>
            )}
            {onDeleteThread && (
              <Tooltip title={t.threadActions?.deleteThread || 'Delete'}>
                <IconButton size="small" onClick={onDeleteThread} sx={{ color: 'error.main', minWidth: 44, minHeight: 44 }}>
                  <Trash2 size={18} />
                </IconButton>
              </Tooltip>
            )}
            {onAddLabelsToThread && (
              <Tooltip title={t.email?.labels?.addLabels || 'Add labels'}>
                <IconButton size="small" onClick={onAddLabelsToThread} sx={{ minWidth: 44, minHeight: 44 }}>
                  <Tag size={18} />
                </IconButton>
              </Tooltip>
            )}

            <IconButton
              size="small"
              onClick={handleMenuOpen}
              aria-label={t.threadView?.actionsLabel || 'More actions'}
              sx={{ minWidth: 44, minHeight: 44 }}
            >
              <MoreHorizontal size={18} />
            </IconButton>
          </Box>

          <Menu
            anchorEl={anchorEl}
            open={menuOpen}
            onClose={handleMenuClose}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          >
            {onMarkThreadRead && (
              <MenuItem onClick={() => handleAction(onMarkThreadRead)}>
                <MailOpen size={16} style={{ marginRight: 8 }} />
                {t.threadActions?.markThreadRead || 'Mark as read'}
              </MenuItem>
            )}
            {onMarkThreadUnread && (
              <MenuItem onClick={() => handleAction(onMarkThreadUnread)}>
                <Mail size={16} style={{ marginRight: 8 }} />
                {t.threadActions?.markThreadUnread || 'Mark as unread'}
              </MenuItem>
            )}
            <Divider />
            {onFlagAllMessages && (
              <MenuItem onClick={() => handleAction(onFlagAllMessages)}>
                <Flag size={16} style={{ marginRight: 8 }} />
                {t.threadActions?.flagThread || 'Flag all'}
              </MenuItem>
            )}
            {onUnflagAllMessages && (
              <MenuItem onClick={() => handleAction(onUnflagAllMessages)}>
                <Flag size={16} style={{ marginRight: 8 }} />
                {t.threadActions?.unflagThread || 'Unflag all'}
              </MenuItem>
            )}
            <Divider />
            {onMoveThread && (
              <MenuItem onClick={() => handleAction(onMoveThread)}>
                <FolderInput size={16} style={{ marginRight: 8 }} />
                {t.threadActions?.moveThread || 'Move to folder'}
              </MenuItem>
            )}
            {onAddLabelsToThread && (
              <MenuItem onClick={() => handleAction(onAddLabelsToThread)}>
                <Tag size={16} style={{ marginRight: 8 }} />
                {t.threadActions?.addLabelsThread || 'Add labels'}
              </MenuItem>
            )}
          </Menu>
        </Box>
      </Box>

      {/* Messages Container */}
      <Box
        ref={scrollRef}
        sx={{
          flex: 1,
          overflow: 'auto',
          bgcolor: (theme) => theme.palette.mode === 'dark' ? 'grey.900' : 'grey.50',
        }}
      >
        <Box sx={{ maxWidth: 900, mx: 'auto', py: 2 }}>
          {/* First Message */}
          {firstMessage && (
            expandedId === firstMessage.id ? (
              <ExpandedMessage
                message={firstMessage}
                onCollapse={() => setExpandedId(null)}
                onReply={onReply}
                onReplyAll={onReplyAll}
                onForward={onForward}
                onFlag={onFlag}
                onLabels={onLabelsMessage}
                onDownloadAttachment={onDownloadAttachment}
              />
            ) : (
              <CollapsedMessage
                message={firstMessage}
                onClick={() => handleMessageClick(firstMessage.id)}
              />
            )
          )}

          {/* "See X more messages" section */}
          {middleMessages.length > 0 && (
            <Box sx={{ my: 1 }}>
              {!middleExpanded ? (
                <Button
                  startIcon={<ChevronDown size={16} />}
                  onClick={handleExpandAll}
                  sx={{
                    width: '100%',
                    justifyContent: 'flex-start',
                    px: 2,
                    py: 1,
                    color: 'primary.main',
                    textTransform: 'none',
                    fontSize: '0.875rem',
                    bgcolor: 'background.paper',
                    border: 1,
                    borderColor: 'divider',
                    borderRadius: 1,
                    '&:hover': {
                      bgcolor: 'action.hover',
                    },
                  }}
                >
                  {t.threadView?.seeMoreMessages?.replace('{count}', String(middleMessages.length)) ||
                    `See ${middleMessages.length} more messages`}
                </Button>
              ) : (
                <>
                  <Button
                    startIcon={<ChevronUp size={16} />}
                    onClick={handleCollapseAll}
                    sx={{
                      width: '100%',
                      justifyContent: 'flex-start',
                      px: 2,
                      py: 1,
                      color: 'text.secondary',
                      textTransform: 'none',
                      fontSize: '0.875rem',
                      '&:hover': {
                        bgcolor: 'action.hover',
                      },
                    }}
                  >
                    {t.threadView?.hideMessages || 'Hide messages'}
                  </Button>
                  {middleMessages.map((message) => (
                    <Box key={message.id} sx={{ mt: 1 }}>
                      {message.isAutoReply ? (
                        <Box
                          sx={{
                            px: 2,
                            py: 1,
                            bgcolor: 'background.paper',
                            border: 1,
                            borderColor: 'divider',
                            borderRadius: 1,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1,
                          }}
                        >
                          <Mail size={16} />
                          <Typography variant="body2" color="text.secondary">
                            {message.from.split('<')[0].trim()} {t.threadView?.sentAutoReply || 'sent an automatic reply'}
                          </Typography>
                        </Box>
                      ) : expandedId === message.id ? (
                        <ExpandedMessage
                          message={message}
                          onCollapse={() => setExpandedId(null)}
                          onReply={onReply}
                          onReplyAll={onReplyAll}
                          onForward={onForward}
                          onFlag={onFlag}
                          onLabels={onLabelsMessage}
                          onDownloadAttachment={onDownloadAttachment}
                        />
                      ) : (
                        <CollapsedMessage
                          message={message}
                          onClick={() => handleMessageClick(message.id)}
                        />
                      )}
                    </Box>
                  ))}
                </>
              )}
            </Box>
          )}

          {/* Last Message (most recent) - Always visible */}
          {lastMessage && lastMessage.id !== firstMessage?.id && (
            <Box sx={{ mt: 1 }}>
              {expandedId === lastMessage.id ? (
                <ExpandedMessage
                  message={lastMessage}
                  onCollapse={() => setExpandedId(null)}
                  onReply={onReply}
                  onReplyAll={onReplyAll}
                  onForward={onForward}
                  onFlag={onFlag}
                  onLabels={onLabelsMessage}
                  onDownloadAttachment={onDownloadAttachment}
                />
              ) : (
                <CollapsedMessage
                  message={lastMessage}
                  onClick={() => handleMessageClick(lastMessage.id)}
                />
              )}
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}

export default ThreadViewOutlook;
