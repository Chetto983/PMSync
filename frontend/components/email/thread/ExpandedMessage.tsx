/**
 * Expanded Message Component - New Outlook Style
 *
 * Full email card with:
 * - Header: Avatar + Name + To/CC + Date + Actions
 * - Body: Full HTML content
 * - Attachments
 * - AI Actions: Summarize, Priority, Sentiment
 *
 * Matches Microsoft's New Outlook expanded message design.
 */

import { memo, useState } from 'react';
import {
  Box,
  Typography,
  Avatar,
  IconButton,
  Tooltip,
  Divider,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import {
  Reply,
  ReplyAll,
  Forward,
  ChevronUp,
  Tag,
  Trash2,
  Archive,
  FolderInput,
  Inbox,
  Paperclip,
} from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { stringToColor } from '@/lib/utils/gravatar';
import { EmailHtmlContent } from './EmailHtmlContent';
import { AttachmentCard } from './AttachmentCard';
import { AiInsightsPanel } from './AiInsightsPanel';
import { AiActionButtons } from './AiActionButtons';

interface ExpandedMessageProps {
  message: {
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
    // AI Triage fields - show existing analysis (aiPriority: 1=highest, 5=lowest)
    aiPriority?: number | null;
    aiPriorityReason?: string | null;
    aiSentiment?: string | null;
    aiLabels?: string[] | null;
  };
  onCollapse: () => void;
  onReply: (messageId: string) => void;
  onReplyAll?: (messageId: string) => void;
  onForward: (messageId: string) => void;
  onFlag: (messageId: string) => void;
  onLabels?: (messageId: string) => void;
  /** Callback when delete is clicked */
  onDelete?: (messageId: string) => void;
  /** Callback when archive is clicked */
  onArchive?: (messageId: string) => void;
  /** Callback when move is clicked (opens folder picker dialog) */
  onMove?: (messageId: string) => void;
  /** Callback when moving to a specific folder directly (no dialog) */
  onMoveToFolder?: (messageId: string, folder: string) => void;
  /** Callback when attachment download is clicked */
  onDownloadAttachment?: (messageId: string, attachmentId: string) => void;
}

/**
 * Get initials from email sender name
 */
function getInitials(from: string): string {
  // Robustly handle "Name <email" format even if truncated
  const name = from.split('<')[0].trim().replace(/^"|"$/g, '');
  const parts = name.split(' ').filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

/**
 * Format sender name for display
 */
function formatSender(from: string): string {
  const name = from.split('<')[0].trim().replace(/^"|"$/g, '');
  if (name) return name;
  return from;
}

/**
 * Format recipient for display
 */
function formatRecipient(email: string): string {
  const name = email.split('<')[0].trim().replace(/^"|"$/g, '');
  if (name && name !== email) return name;

  // If no name part or name equals email, try to clean the email part
  const addr = email.match(/<([^>]+)/)?.[1] || email;
  return addr;
}

export const ExpandedMessage = memo(function ExpandedMessage({
  message,
  onCollapse,
  onReply,
  onReplyAll,
  onForward,
  onFlag,
  onLabels,
  onDelete,
  onArchive,
  onMove,
  onMoveToFolder,
  onDownloadAttachment,
}: ExpandedMessageProps) {
  void onFlag; // Reserved for future use
  const t = useTranslations();
  const [showActions, setShowActions] = useState(false);
  const [showAllRecipients, setShowAllRecipients] = useState(false);

  // Move menu state
  const [moveMenuAnchor, setMoveMenuAnchor] = useState<HTMLElement | null>(null);
  const moveMenuOpen = Boolean(moveMenuAnchor);

  // AI Features State (Phase 8) - Summary only
  const [showSummary, setShowSummary] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);

  // AI callback handlers
  const handleSummaryGenerated = (newSummary: string) => {
    setSummary(newSummary);
    setShowSummary(true);
  };

  // Move menu handlers
  const handleMoveClick = (event: React.MouseEvent<HTMLElement>) => {
    setMoveMenuAnchor(event.currentTarget);
  };

  const handleMoveClose = () => {
    setMoveMenuAnchor(null);
  };

  const handleMoveToFolder = (folder: string) => {
    handleMoveClose();
    if (onMoveToFolder) {
      onMoveToFolder(message.id, folder);
    } else if (onMove) {
      // Fallback to old behavior
      onMove(message.id);
    }
  };

  return (
    <Box
      sx={{
        bgcolor: 'background.paper',
        border: 1,
        borderColor: 'divider',
        borderRadius: 1,
        overflow: 'hidden',
        // Unread indicator
        ...(message.isUnread && {
          borderLeft: 3,
          borderLeftColor: 'primary.main',
        }),
      }}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Subject Line - Restored */}
      <Box sx={{ px: 2, pt: 2, pb: 1 }}>
        <Typography variant="h6" sx={{ fontSize: '1.1rem', fontWeight: 600, lineHeight: 1.3 }}>
          {message.subject || '(No Subject)'}
        </Typography>
      </Box>

      <Divider sx={{ opacity: 0.5 }} />

      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 1.5,
          px: 2,
          py: 1.5,
        }}
      >
        {/* Avatar */}
        <Avatar
          src={message.avatarUrl}
          sx={{
            width: 40,
            height: 40,
            fontSize: '0.9rem',
            flexShrink: 0,
            mt: 0.5,
            bgcolor: message.avatarUrl ? undefined : stringToColor(message.from),
          }}
        >
          {getInitials(message.from)}
        </Avatar>

        {/* Sender Info */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {/* Sender Name */}
          <Tooltip title={message.from} placement="top-start">
            <Typography
              variant="body1"
              sx={{
                fontWeight: 600,
                fontSize: '0.9375rem',
                cursor: 'default'
              }}
            >
              {formatSender(message.from)}
            </Typography>
          </Tooltip>

          {/* To Recipients */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25, flexWrap: 'wrap' }}>
            <Typography variant="caption" color="text.secondary">
              {t.threadMessage?.to || 'To:'}
            </Typography>
            {(showAllRecipients ? message.to : message.to.slice(0, 3)).map((recipient, idx, arr) => (
              <Typography key={idx} variant="caption" color="text.secondary">
                {formatRecipient(recipient)}
                {idx < arr.length - 1 && ','}
              </Typography>
            ))}
            {!showAllRecipients && message.to.length > 3 && (
              <Typography
                variant="caption"
                component="button"
                onClick={() => setShowAllRecipients(true)}
                sx={{
                  color: 'primary.main',
                  cursor: 'pointer',
                  border: 'none',
                  background: 'none',
                  p: 0,
                  fontFamily: 'inherit',
                  fontSize: 'inherit',
                  '&:hover': { textDecoration: 'underline' },
                }}
              >
                +{message.to.length - 3}
              </Typography>
            )}
          </Box>

          {/* CC Recipients */}
          {message.cc && message.cc.length > 0 && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
              <Typography variant="caption" color="text.secondary">
                {t.threadMessage?.cc || 'CC:'}
              </Typography>
              {(showAllRecipients ? message.cc : message.cc.slice(0, 2)).map((recipient, idx, arr) => (
                <Typography key={idx} variant="caption" color="text.secondary">
                  {formatRecipient(recipient)}
                  {idx < arr.length - 1 && ','}
                </Typography>
              ))}
              {!showAllRecipients && message.cc.length > 2 && (
                <Typography
                  variant="caption"
                  component="button"
                  onClick={() => setShowAllRecipients(true)}
                  sx={{
                    color: 'primary.main',
                    cursor: 'pointer',
                    border: 'none',
                    background: 'none',
                    p: 0,
                    fontFamily: 'inherit',
                    fontSize: 'inherit',
                    '&:hover': { textDecoration: 'underline' },
                  }}
                >
                  +{message.cc.length - 2}
                </Typography>
              )}
            </Box>
          )}

          {/* Show less button when expanded */}
          {showAllRecipients && (message.to.length > 3 || (message.cc && message.cc.length > 2)) && (
            <Typography
              variant="caption"
              component="button"
              onClick={() => setShowAllRecipients(false)}
              sx={{
                color: 'primary.main',
                cursor: 'pointer',
                border: 'none',
                background: 'none',
                p: 0,
                mt: 0.25,
                fontFamily: 'inherit',
                fontSize: 'inherit',
                '&:hover': { textDecoration: 'underline' },
              }}
            >
              {t.common?.showLess || 'Show less'}
            </Typography>
          )}

        </Box>

        {/* Right Side: Date + Actions */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
          {/* Action Icons (visible on hover) - Reply actions only, others in action bar below */}
          {showActions && (
            <Box sx={{ display: 'flex', gap: 0.25 }}>
              <Tooltip title={t.threadMessage?.reply || 'Reply'}>
                <IconButton size="small" onClick={() => onReply(message.id)} sx={{ p: 0.5 }}>
                  <Reply size={16} />
                </IconButton>
              </Tooltip>
              {onReplyAll && (
                <Tooltip title={t.threadMessage?.replyAll || 'Reply All'}>
                  <IconButton size="small" onClick={() => onReplyAll(message.id)} sx={{ p: 0.5 }}>
                    <ReplyAll size={16} />
                  </IconButton>
                </Tooltip>
              )}
              <Tooltip title={t.threadMessage?.forward || 'Forward'}>
                <IconButton size="small" onClick={() => onForward(message.id)} sx={{ p: 0.5 }}>
                  <Forward size={16} />
                </IconButton>
              </Tooltip>
            </Box>
          )}

          {/* Date */}
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
            {message.date}
          </Typography>

          {/* Collapse button */}
          <IconButton size="small" onClick={onCollapse} sx={{ p: 0.5 }}>
            <ChevronUp size={18} />
          </IconButton>
        </Box>
      </Box>

      {/* Action Buttons Row - Icon buttons (mobile-style) */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          px: 2,
          py: 1,
          pl: 7.5,
          borderBottom: 1,
          borderColor: 'divider',
          bgcolor: (theme) => theme.palette.mode === 'dark' ? 'grey.900' : 'grey.50',
        }}
      >
        {/* Labels Icon Button */}
        {onLabels && (
          <Tooltip title={t.email?.labels?.addLabels || 'Add Labels'}>
            <IconButton
              size="small"
              onClick={() => onLabels(message.id)}
              sx={{
                bgcolor: 'primary.main',
                color: 'primary.contrastText',
                '&:hover': { bgcolor: 'primary.dark' },
              }}
            >
              <Tag size={18} />
            </IconButton>
          </Tooltip>
        )}

        {/* Move Icon Button with Dropdown */}
        {(onMove || onMoveToFolder) && (
          <>
            <Tooltip title={t.threadActions?.moveThread || 'Move'}>
              <IconButton
                size="small"
                onClick={handleMoveClick}
                sx={{ color: 'text.secondary' }}
              >
                <FolderInput size={18} />
              </IconButton>
            </Tooltip>
            <Menu
              anchorEl={moveMenuAnchor}
              open={moveMenuOpen}
              onClose={handleMoveClose}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
              transformOrigin={{ vertical: 'top', horizontal: 'left' }}
            >
              <MenuItem onClick={() => handleMoveToFolder('INBOX')}>
                <ListItemIcon>
                  <Inbox size={18} />
                </ListItemIcon>
                <ListItemText>{t.folders.inbox}</ListItemText>
              </MenuItem>
              <MenuItem onClick={() => handleMoveToFolder('ARCHIVE')}>
                <ListItemIcon>
                  <Archive size={18} />
                </ListItemIcon>
                <ListItemText>{t.folders.archive}</ListItemText>
              </MenuItem>
              <MenuItem onClick={() => handleMoveToFolder('TRASH')}>
                <ListItemIcon>
                  <Trash2 size={18} />
                </ListItemIcon>
                <ListItemText>{t.folders.trash}</ListItemText>
              </MenuItem>
            </Menu>
          </>
        )}

        {/* Archive Icon Button */}
        {onArchive && (
          <Tooltip title={t.threadActions?.archiveThread || 'Archive'}>
            <IconButton
              size="small"
              onClick={() => onArchive(message.id)}
              sx={{ color: 'text.secondary' }}
            >
              <Archive size={18} />
            </IconButton>
          </Tooltip>
        )}

        {/* Delete Icon Button */}
        {onDelete && (
          <Tooltip title={t.threadActions?.deleteThread || 'Delete'}>
            <IconButton
              size="small"
              onClick={() => onDelete(message.id)}
              sx={{ color: 'error.main' }}
            >
              <Trash2 size={18} />
            </IconButton>
          </Tooltip>
        )}

        <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

        {/* AI Action Buttons */}
        <AiActionButtons
          emailId={message.id}
          onSummaryGenerated={handleSummaryGenerated}
          showSummary={showSummary}
          onToggleSummary={() => setShowSummary(!showSummary)}
          hasSummary={!!summary}
          existingPriority={message.aiPriority}
          existingPriorityReason={message.aiPriorityReason}
          existingSentiment={message.aiSentiment}
        />
      </Box>

      {/* AI Summary Panel - TOP Position (Phase 8) */}
      <AiInsightsPanel
        showSummary={showSummary}
        summary={summary}
      />

      {/* Body */}
      <Box sx={{ px: 2, pb: 2, pl: 7.5 }}>
        <EmailHtmlContent html={message.body} attachments={message.attachments} />
      </Box>

      {/* Attachments - TailAdmin Style */}
      {message.attachments && message.attachments.length > 0 && (
        <Box sx={{ px: 2, pb: 2, pl: 7.5 }}>
          <Divider sx={{ mb: 1.5 }} />
          {/* Attachment Header */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1.5 }}>
            <Paperclip size={18} style={{ color: 'var(--mui-palette-text-secondary)' }} />
            <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
              {t.threadMessage?.attachments?.replace('{count}', String(message.attachments.length)) ||
                `${message.attachments.length} Attachments`}
            </Typography>
          </Box>
          {/* Attachment Cards */}
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
            {message.attachments.map((attachment) => (
              <AttachmentCard
                key={attachment.id}
                attachment={{
                  id: attachment.id,
                  name: attachment.name,
                  size: attachment.size,
                  contentId: attachment.contentId,
                }}
                onDownload={
                  onDownloadAttachment
                    ? (attachmentId) => onDownloadAttachment(message.id, attachmentId)
                    : undefined
                }
              />
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
});

export default ExpandedMessage;
