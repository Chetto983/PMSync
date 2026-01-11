/**
 * Expanded Message Component - New Outlook Style
 *
 * Full email card with:
 * - Header: Avatar + Name + To/CC + Date + Actions
 * - Body: Full HTML content
 * - Attachments
 * - Footer: Reply, Reply All, Forward buttons
 *
 * Matches Microsoft's New Outlook expanded message design.
 */

import { memo, useState } from 'react';
import { Box, Typography, Avatar, IconButton, Button, Tooltip, Divider } from '@mui/material';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import ReplyIcon from '@mui/icons-material/Reply';
import ReplyAllIcon from '@mui/icons-material/ReplyAll';
import ForwardIcon from '@mui/icons-material/Forward';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import LabelIcon from '@mui/icons-material/Label';
import { useTranslations } from '@/lib/hooks/use-translations';
import { stringToColor } from '@/lib/utils/gravatar';
import { EmailHtmlContent } from './EmailHtmlContent';
import { AttachmentCard } from './AttachmentCard';

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
  };
  onCollapse: () => void;
  onReply: (messageId: string) => void;
  onReplyAll?: (messageId: string) => void;
  onForward: (messageId: string) => void;
  onFlag: (messageId: string) => void;
  onLabels?: (messageId: string) => void;
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
  onDownloadAttachment,
}: ExpandedMessageProps) {
  void onFlag; // Reserved for future use
  const t = useTranslations();
  const [showActions, setShowActions] = useState(false);

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
            {message.to.slice(0, 3).map((recipient, idx) => (
              <Typography key={idx} variant="caption" color="text.secondary">
                {formatRecipient(recipient)}
                {idx < Math.min(message.to.length, 3) - 1 && ','}
              </Typography>
            ))}
            {message.to.length > 3 && (
              <Typography variant="caption" color="text.secondary">
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
              {message.cc.slice(0, 2).map((recipient, idx) => (
                <Typography key={idx} variant="caption" color="text.secondary">
                  {formatRecipient(recipient)}
                  {idx < Math.min(message.cc!.length, 2) - 1 && ','}
                </Typography>
              ))}
              {message.cc.length > 2 && (
                <Typography variant="caption" color="text.secondary">
                  +{message.cc.length - 2}
                </Typography>
              )}
            </Box>
          )}
        </Box>

        {/* Right Side: Date + Actions */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
          {/* Action Icons (visible on hover) */}
          {showActions && (
            <Box sx={{ display: 'flex', gap: 0.25 }}>
              <Tooltip title={t.threadMessage?.reply || 'Reply'}>
                <IconButton size="small" onClick={() => onReply(message.id)} sx={{ p: 0.5 }}>
                  <ReplyIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
              {onReplyAll && (
                <Tooltip title={t.threadMessage?.replyAll || 'Reply All'}>
                  <IconButton size="small" onClick={() => onReplyAll(message.id)} sx={{ p: 0.5 }}>
                    <ReplyAllIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
              )}
              <Tooltip title={t.threadMessage?.forward || 'Forward'}>
                <IconButton size="small" onClick={() => onForward(message.id)} sx={{ p: 0.5 }}>
                  <ForwardIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
              {onLabels && (
                <Tooltip title={t.email?.labels?.addLabels || 'Labels'}>
                  <IconButton size="small" onClick={() => onLabels(message.id)} sx={{ p: 0.5 }}>
                    <LabelIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
              )}
            </Box>
          )}

          {/* Date */}
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
            {message.date}
          </Typography>

          {/* Collapse button */}
          <IconButton size="small" onClick={onCollapse} sx={{ p: 0.5 }}>
            <ExpandLessIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Box>
      </Box>

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
            <AttachFileIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
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

      {/* Footer Action Bar */}
      <Box
        sx={{
          display: 'flex',
          gap: 1,
          px: 2,
          py: 1.5,
          borderTop: 1,
          borderColor: 'divider',
          bgcolor: (theme) => theme.palette.mode === 'dark' ? 'grey.900' : 'grey.50',
        }}
      >
        <Button
          size="small"
          variant="text"
          startIcon={<ReplyIcon sx={{ fontSize: 16 }} />}
          onClick={() => onReply(message.id)}
          sx={{ textTransform: 'none', color: 'text.secondary' }}
        >
          {t.threadMessage?.reply || 'Reply'}
        </Button>
        {onReplyAll && (
          <Button
            size="small"
            variant="text"
            startIcon={<ReplyAllIcon sx={{ fontSize: 16 }} />}
            onClick={() => onReplyAll(message.id)}
            sx={{ textTransform: 'none', color: 'text.secondary' }}
          >
            {t.threadMessage?.replyAll || 'Reply All'}
          </Button>
        )}
        <Button
          size="small"
          variant="text"
          startIcon={<ForwardIcon sx={{ fontSize: 16 }} />}
          onClick={() => onForward(message.id)}
          sx={{ textTransform: 'none', color: 'text.secondary' }}
        >
          {t.threadMessage?.forward || 'Forward'}
        </Button>
        {onLabels && (
          <Button
            size="small"
            variant="text"
            startIcon={<LabelIcon sx={{ fontSize: 16 }} />}
            onClick={() => onLabels(message.id)}
            sx={{ textTransform: 'none', color: 'text.secondary' }}
          >
            {t.email?.labels?.title || 'Labels'}
          </Button>
        )}
      </Box>
    </Box>
  );
});

export default ExpandedMessage;
