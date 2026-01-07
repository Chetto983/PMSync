/**
 * Collapsed Message Component - New Outlook Style
 *
 * Single line message preview: Avatar + Name + Preview + Date
 * Matches Microsoft's New Outlook collapsed thread message design.
 */

import { memo } from 'react';
import { Box, Typography, Avatar, Tooltip } from '@mui/material';
import { Flag, Paperclip } from 'lucide-react';

interface CollapsedMessageProps {
  message: {
    id: string;
    from: string;
    body: string;
    date: string;
    isUnread: boolean;
    isFlagged: boolean;
    hasAttachments: boolean;
    avatarUrl?: string;
  };
  onClick: () => void;
}

/**
 * Get initials from email sender name
 */
/**
 * Get initials from email sender name
 */
function getInitials(from: string): string {
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
 * Strip HTML tags and get plain text preview
 */
function getPreview(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 100);
}

export const CollapsedMessage = memo(function CollapsedMessage({
  message,
  onClick,
}: CollapsedMessageProps) {
  return (
    <Box
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        px: 2,
        py: 1.25,
        bgcolor: 'background.paper',
        border: 1,
        borderColor: 'divider',
        borderRadius: 1,
        cursor: 'pointer',
        transition: 'background-color 0.15s ease',
        '&:hover': {
          bgcolor: 'action.hover',
        },
        '&:focus-visible': {
          outline: '2px solid',
          outlineColor: 'primary.main',
          outlineOffset: -2,
        },
        // Unread indicator
        ...(message.isUnread && {
          borderLeft: 3,
          borderLeftColor: 'primary.main',
        }),
      }}
    >
      {/* Avatar */}
      <Avatar
        src={message.avatarUrl}
        sx={{
          width: 32,
          height: 32,
          fontSize: '0.8rem',
          bgcolor: 'primary.main',
          flexShrink: 0,
        }}
      >
        {getInitials(message.from)}
      </Avatar>

      {/* Sender Name */}
      <Tooltip title={message.from} placement="bottom-start">
        <Typography
          variant="body2"
          sx={{
            fontWeight: message.isUnread ? 600 : 400,
            fontSize: '0.875rem',
            flexShrink: 0,
            maxWidth: 150,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {formatSender(message.from)}
        </Typography>
      </Tooltip>

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

      {/* Preview Text */}
      <Typography
        variant="body2"
        color="text.secondary"
        sx={{
          flex: 1,
          fontSize: '0.8125rem',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {getPreview(message.body)}
      </Typography>

      {/* Date */}
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{
          flexShrink: 0,
          fontSize: '0.75rem',
        }}
      >
        {message.date}
      </Typography>
    </Box>
  );
});

export default CollapsedMessage;
