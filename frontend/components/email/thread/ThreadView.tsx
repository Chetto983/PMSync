/**
 * Thread View Component
 *
 * Displays an email conversation/thread with collapsible messages.
 * Uses MUI Accordion for expand/collapse functionality.
 *
 * Features:
 * - Collapsible email messages
 * - Expand all / Collapse all
 * - Thread header with subject
 * - Individual message actions
 *
 * Design inspiration: Gmail thread view
 * @see https://mui.com/material-ui/react-accordion/
 */

import { useState } from 'react';
import { Box, Typography, Button, IconButton, Menu, MenuItem, Divider } from '@mui/material';
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
  MoreVertical,
} from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { ThreadMessage, ThreadMessageData } from './ThreadMessage';

interface ThreadViewProps {
  /** Thread ID */
  threadId: string;
  /** Thread subject line */
  subject: string;
  /** Array of messages in the thread */
  messages: ThreadMessageData[];
  /** Callback when back button is clicked */
  onBack: () => void;
  /** Callback when flag is toggled on single message */
  onFlag: (messageId: string) => void;
  /** Callback when reply is clicked */
  onReply: (messageId: string) => void;
  /** Callback when forward is clicked */
  onForward: (messageId: string) => void;
  /** Bulk thread actions */
  onDeleteThread?: () => void;
  onMoveThread?: () => void;
  onArchiveThread?: () => void;
  onMarkThreadRead?: () => void;
  onMarkThreadUnread?: () => void;
  onFlagAllMessages?: () => void;
  onUnflagAllMessages?: () => void;
  onAddLabelsToThread?: () => void;
}

/**
 * Thread conversation view with collapsible messages
 *
 * Best practices from research:
 * - Most recent message expanded by default
 * - Previous messages collapsed
 * - Expand all / Collapse all control
 * - Smooth accordion transitions
 */
export function ThreadView({
  threadId: _threadId,
  subject,
  messages,
  onBack,
  onFlag,
  onReply,
  onForward,
  onDeleteThread,
  onMoveThread,
  onArchiveThread,
  onMarkThreadRead,
  onMarkThreadUnread,
  onFlagAllMessages,
  onUnflagAllMessages,
  onAddLabelsToThread,
}: ThreadViewProps) {
  const t = useTranslations();

  // Action menu state
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const menuOpen = Boolean(anchorEl);

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleAction = (action: () => void | undefined) => {
    handleMenuClose();
    action?.();
  };

  // State: expanded message IDs (most recent expanded by default)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    new Set(messages.length > 0 ? [messages[messages.length - 1].id] : [])
  );

  // Toggle single message
  const handleMessageChange = (messageId: string, isExpanded: boolean) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (isExpanded) {
        next.add(messageId);
      } else {
        next.delete(messageId);
      }
      return next;
    });
  };

  // Expand all messages
  const handleExpandAll = () => {
    setExpandedIds(new Set(messages.map((m) => m.id)));
  };

  // Collapse all messages (except the most recent)
  const handleCollapseAll = () => {
    setExpandedIds(
      new Set(messages.length > 0 ? [messages[messages.length - 1].id] : [])
    );
  };

  const allExpanded = expandedIds.size === messages.length;
  const noneExpanded = expandedIds.size === 0;

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
      {/* Thread Header */}
      <Box
        sx={{
          px: 2,
          py: 1.5,
          borderBottom: 1,
          borderColor: 'divider',
          bgcolor: 'background.paper',
          display: 'flex',
          alignItems: 'center',
          gap: 2,
        }}
      >
        {/* Back button */}
        <IconButton
          size="small"
          onClick={onBack}
          sx={{ flexShrink: 0 }}
          aria-label={t.common.close}
        >
          <ArrowLeft size={20} />
        </IconButton>

        {/* Subject */}
        <Typography
          variant="h6"
          sx={{
            flex: 1,
            fontSize: '1rem',
            fontWeight: 600,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {subject}
        </Typography>

        {/* Message count */}
        <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
          {messages.length} {messages.length === 1 ? 'message' : 'messages'}
        </Typography>

        {/* Expand/Collapse all */}
        {messages.length > 1 && (
          <>
            {!allExpanded && (
              <Button
                size="small"
                startIcon={<ChevronDown size={16} />}
                onClick={handleExpandAll}
                sx={{ flexShrink: 0 }}
              >
                Expand all
              </Button>
            )}
            {!noneExpanded && (
              <Button
                size="small"
                startIcon={<ChevronUp size={16} />}
                onClick={handleCollapseAll}
                sx={{ flexShrink: 0 }}
              >
                Collapse all
              </Button>
            )}
          </>
        )}

        {/* Thread bulk actions menu */}
        <IconButton
          size="small"
          onClick={handleMenuOpen}
          sx={{ flexShrink: 0 }}
          aria-label="Thread actions"
        >
          <MoreVertical size={20} />
        </IconButton>

        <Menu
          anchorEl={anchorEl}
          open={menuOpen}
          onClose={handleMenuClose}
          anchorOrigin={{
            vertical: 'bottom',
            horizontal: 'right',
          }}
          transformOrigin={{
            vertical: 'top',
            horizontal: 'right',
          }}
        >
          {/* Mark as read/unread */}
          {onMarkThreadRead && (
            <MenuItem onClick={() => handleAction(onMarkThreadRead)}>
              <MailOpen size={16} style={{ marginRight: 8 }} />
              {t.threadActions.markThreadRead}
            </MenuItem>
          )}
          {onMarkThreadUnread && (
            <MenuItem onClick={() => handleAction(onMarkThreadUnread)}>
              <Mail size={16} style={{ marginRight: 8 }} />
              {t.threadActions.markThreadUnread}
            </MenuItem>
          )}

          <Divider />

          {/* Flag/unflag all */}
          {onFlagAllMessages && (
            <MenuItem onClick={() => handleAction(onFlagAllMessages)}>
              <Flag size={16} style={{ marginRight: 8 }} />
              {t.threadActions.flagThread}
            </MenuItem>
          )}
          {onUnflagAllMessages && (
            <MenuItem onClick={() => handleAction(onUnflagAllMessages)}>
              <Flag size={16} style={{ marginRight: 8 }} />
              {t.threadActions.unflagThread}
            </MenuItem>
          )}

          <Divider />

          {/* Move and archive */}
          {onMoveThread && (
            <MenuItem onClick={() => handleAction(onMoveThread)}>
              <FolderInput size={16} style={{ marginRight: 8 }} />
              {t.threadActions.moveThread}
            </MenuItem>
          )}
          {onArchiveThread && (
            <MenuItem onClick={() => handleAction(onArchiveThread)}>
              <Archive size={16} style={{ marginRight: 8 }} />
              {t.threadActions.archiveThread}
            </MenuItem>
          )}

          {/* Labels */}
          {onAddLabelsToThread && (
            <MenuItem onClick={() => handleAction(onAddLabelsToThread)}>
              <Tag size={16} style={{ marginRight: 8 }} />
              {t.threadActions.addLabelsThread}
            </MenuItem>
          )}

          <Divider />

          {/* Delete - dangerous action at bottom */}
          {onDeleteThread && (
            <MenuItem
              onClick={() => handleAction(onDeleteThread)}
              sx={{ color: 'error.main' }}
            >
              <Trash2 size={16} style={{ marginRight: 8 }} />
              {t.threadActions.deleteThread}
            </MenuItem>
          )}
        </Menu>
      </Box>

      {/* Thread Messages */}
      <Box
        sx={{
          flex: 1,
          overflow: 'auto',
        }}
      >
        {messages.map((message) => (
          <ThreadMessage
            key={message.id}
            message={message}
            expanded={expandedIds.has(message.id)}
            onChange={handleMessageChange}
            onFlag={onFlag}
            onReply={onReply}
            onForward={onForward}
          />
        ))}
      </Box>
    </Box>
  );
}

export default ThreadView;
