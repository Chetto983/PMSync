/**
 * Message Card Component (Outlook Classic Style)
 *
 * Reusable card for displaying a single email message in a thread.
 * Supports collapsed (preview) and expanded (full content) states.
 *
 * Features:
 * - Clean avatar + sender info header
 * - Collapsible with click
 * - Full email content when expanded
 * - Action buttons (Reply, Forward)
 * - Attachment display
 * - Memoized for virtual scroll performance
 */

import { memo, useState } from 'react';
import {
  Box,
  Typography,
  Avatar,
  IconButton,
  Button,
  Chip,
  Collapse,
  Tooltip,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import {
  ChevronDown,
  ChevronRight,
  Flag,
  Reply,
  Forward,
  Paperclip,
} from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { EmailHtmlContent } from './EmailHtmlContent';

export interface MessageCardData {
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
  labels?: Array<{ id: string; name: string; color: string }>;
}

interface MessageCardProps {
  message: MessageCardData;
  expanded: boolean;
  isFirst?: boolean;
  isLast?: boolean;
  onToggle: (messageId: string) => void;
  onFlag: (messageId: string) => void;
  onReply: (messageId: string) => void;
  onForward: (messageId: string) => void;
}

/**
 * Get initials from name for avatar fallback
 */
function getInitials(name: string): string {
  const cleaned = name.replace(/<.*>/, '').trim();
  const parts = cleaned.split(' ').filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return cleaned.slice(0, 2).toUpperCase();
}

/**
 * Format email sender for display
 */
function formatSender(from: string): string {
  // Extract name from "Name <email>" format
  const match = from.match(/^([^<]+)</);
  if (match) {
    return match[1].trim();
  }
  // Just email, extract before @
  const atIndex = from.indexOf('@');
  if (atIndex > 0) {
    return from.substring(0, atIndex);
  }
  return from;
}

export const MessageCard = memo(function MessageCard({
  message,
  expanded,
  isFirst: _isFirst = false,
  isLast = false,
  onToggle,
  onFlag,
  onReply,
  onForward,
}: MessageCardProps) {
  const t = useTranslations();
  const theme = useTheme();
  const isNarrowViewport = useMediaQuery(theme.breakpoints.down('md'));
  const hasTouchPointer = useMediaQuery('(hover: none), (pointer: coarse)');
  const isTouchLayout = isNarrowViewport || hasTouchPointer;
  const [showActions, setShowActions] = useState(false);

  const handleClick = () => {
    onToggle(message.id);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onToggle(message.id);
    }
  };

  return (
    <Box
      sx={{
        bgcolor: 'background.paper',
        borderBottom: isLast ? 0 : 1,
        borderColor: 'divider',
        // Unread indicator
        ...(message.isUnread && {
          borderLeft: 3,
          borderLeftColor: 'primary.main',
        }),
      }}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Collapsed Header - Always visible */}
      <Box
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          px: 2,
          py: 1.5,
          cursor: 'pointer',
          '&:hover': {
            bgcolor: 'action.hover',
          },
          '&:focus-visible': {
            outline: '2px solid',
            outlineColor: 'primary.main',
            outlineOffset: -2,
          },
        }}
      >
        {/* Expand/Collapse icon */}
        <Box sx={{ flexShrink: 0, width: 20, display: 'flex', alignItems: 'center' }}>
          {expanded ? (
            <ChevronDown size={18} />
          ) : (
            <ChevronRight size={18} />
          )}
        </Box>

        {/* Avatar */}
        <Avatar
          src={message.avatarUrl}
          sx={{
            width: 36,
            height: 36,
            fontSize: '0.875rem',
            flexShrink: 0,
            bgcolor: 'primary.main',
          }}
        >
          {getInitials(message.from)}
        </Avatar>

        {/* Message info */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {/* Sender name */}
            <Typography
              variant="body2"
              sx={{
                fontWeight: message.isUnread ? 600 : 400,
                fontSize: '0.9rem',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {formatSender(message.from)}
            </Typography>

            {/* Indicators */}
            {message.isFlagged && (
              <Flag
                size={14}
                fill="currentColor"
                style={{ color: 'var(--mui-palette-error-main)', flexShrink: 0 }}
              />
            )}
            {message.hasAttachments && (
              <Paperclip
                size={14}
                style={{ color: 'var(--mui-palette-text-secondary)', flexShrink: 0 }}
              />
            )}
            {message.labels?.slice(0, 2).map((label) => (
              <Chip
                key={label.id}
                label={label.name}
                size="small"
                sx={{
                  height: 16,
                  fontSize: '0.6rem',
                  bgcolor: label.color,
                  color: 'white',
                  '& .MuiChip-label': { px: 0.5 },
                }}
              />
            ))}
          </Box>

          {/* Preview text (only when collapsed) */}
          {!expanded && (
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{
                fontSize: '0.8125rem',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                mt: 0.25,
              }}
            >
              {message.body.replace(/<[^>]*>/g, '').substring(0, 120)}...
            </Typography>
          )}
        </Box>

        {/* Date */}
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ flexShrink: 0, fontSize: '0.75rem' }}
        >
          {message.date}
        </Typography>

        {/* Quick actions on hover (collapsed only) */}
        {!expanded && (showActions || isTouchLayout) && (
          <Box
            sx={{ display: 'flex', gap: 0.5, ml: 1 }}
            onClick={(e) => e.stopPropagation()}
          >
            <Tooltip title={t.threadMessage?.reply || 'Reply'}>
              <IconButton
                size="small"
                onClick={() => onReply(message.id)}
                sx={{ p: 0.5 }}
              >
                <Reply size={16} />
              </IconButton>
            </Tooltip>
            <Tooltip title={message.isFlagged ? 'Remove flag' : 'Flag'}>
              <IconButton
                size="small"
                onClick={() => onFlag(message.id)}
                sx={{ p: 0.5 }}
              >
                <Flag size={16} fill={message.isFlagged ? 'currentColor' : 'none'} />
              </IconButton>
            </Tooltip>
          </Box>
        )}
      </Box>

      {/* Expanded Content */}
      <Collapse in={expanded} timeout={0} unmountOnExit={false}>
        <Box sx={{ px: 2, pb: 2, pl: 7.5 }}>
          {/* Recipients */}
          <Box sx={{ mb: 2, py: 1, borderBottom: 1, borderColor: 'divider' }}>
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8125rem' }}>
              <strong>{t.threadMessage?.to || 'To:'}</strong> {message.to.join(', ')}
            </Typography>
            {message.cc && message.cc.length > 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8125rem', mt: 0.5 }}>
                <strong>{t.threadMessage?.cc || 'Cc:'}</strong> {message.cc.join(', ')}
              </Typography>
            )}
          </Box>

          {/* Email body - with cid: URL resolution for inline images */}
          <Box sx={{ mb: 2 }}>
            <EmailHtmlContent html={message.body} attachments={message.attachments} />
          </Box>

          {/* Attachments */}
          {message.attachments && message.attachments.length > 0 && (
            <Box sx={{ mt: 2, pt: 2, borderTop: 1, borderColor: 'divider' }}>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                {t.threadMessage?.attachments?.replace('{count}', String(message.attachments.length)) ||
                  `Attachments (${message.attachments.length})`}
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {message.attachments.map((attachment) => (
                  <Chip
                    key={attachment.id}
                    icon={<Paperclip size={14} />}
                    label={`${attachment.name} (${Math.round(attachment.size / 1024)}KB)`}
                    size="small"
                    variant="outlined"
                    clickable
                  />
                ))}
              </Box>
            </Box>
          )}

          {/* Action buttons */}
          <Box sx={{ display: 'flex', gap: 1, mt: 3 }}>
            <Button
              size="small"
              variant="outlined"
              startIcon={<Reply size={16} />}
              onClick={() => onReply(message.id)}
              sx={{ textTransform: 'none', borderRadius: 1 }}
            >
              {t.threadMessage?.reply || 'Reply'}
            </Button>
            <Button
              size="small"
              variant="outlined"
              startIcon={<Forward size={16} />}
              onClick={() => onForward(message.id)}
              sx={{ textTransform: 'none', borderRadius: 1 }}
            >
              {t.threadMessage?.forward || 'Forward'}
            </Button>
          </Box>
        </Box>
      </Collapse>
    </Box>
  );
});

export default MessageCard;
