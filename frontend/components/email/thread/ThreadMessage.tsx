/**
 * Thread Message Component
 *
 * Single email message within a thread conversation.
 * Used with MUI Accordion for collapsible thread view.
 *
 * Design: Gmail/Outlook-inspired collapsible messages
 * @see https://mui.com/material-ui/react-accordion/
 */

import { useState } from 'react';
import {
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Box,
  Typography,
  Avatar,
  IconButton,
  Chip,
} from '@mui/material';
import { ChevronDown, Flag, Reply, Forward, MoreVertical, Paperclip } from 'lucide-react';

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
  attachments?: Array<{ id: string; name: string; size: number }>;
  avatarUrl?: string;
}

interface ThreadMessageProps {
  message: ThreadMessageData;
  expanded: boolean;
  onChange: (messageId: string, isExpanded: boolean) => void;
  onFlag: (messageId: string) => void;
  onReply: (messageId: string) => void;
  onForward: (messageId: string) => void;
}

/**
 * Collapsible email message in thread view
 *
 * Features:
 * - Accordion collapse/expand
 * - Avatar + sender + date in summary
 * - Full email body in details
 * - Action buttons (flag, reply, forward)
 * - Attachment indicators
 */
export function ThreadMessage({
  message,
  expanded,
  onChange,
  onFlag,
  onReply,
  onForward,
}: ThreadMessageProps) {
  const [showActions, setShowActions] = useState(false);

  const handleAccordionChange = (_event: React.SyntheticEvent, isExpanded: boolean) => {
    onChange(message.id, isExpanded);
  };

  // Get initials for avatar fallback
  const getInitials = (name: string) => {
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  return (
    <Accordion
      expanded={expanded}
      onChange={handleAccordionChange}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
      disableGutters
      elevation={0}
      sx={{
        bgcolor: message.isUnread ? 'rgba(25, 118, 210, 0.04)' : 'transparent',
        borderBottom: 1,
        borderColor: 'divider',
        '&:before': {
          display: 'none', // Remove default MUI divider
        },
        '&.Mui-expanded': {
          bgcolor: 'background.paper',
        },
      }}
    >
      {/* Collapsed: Shows sender, date, snippet */}
      <AccordionSummary
        expandIcon={<ChevronDown size={20} />}
        sx={{
          px: 2,
          py: 1,
          minHeight: 56,
          '&.Mui-expanded': {
            minHeight: 56,
          },
          '& .MuiAccordionSummary-content': {
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            my: 1,
          },
        }}
      >
        {/* Avatar */}
        <Avatar
          src={message.avatarUrl}
          sx={{
            width: 32,
            height: 32,
            fontSize: '0.875rem',
            flexShrink: 0,
          }}
        >
          {getInitials(message.from)}
        </Avatar>

        {/* Message summary */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
            {/* Sender */}
            <Typography
              variant="body2"
              sx={{
                fontWeight: message.isUnread ? 600 : 400,
                fontSize: '0.875rem',
              }}
            >
              {message.from}
            </Typography>

            {/* Indicators */}
            {message.hasAttachments && (
              <Paperclip size={14} style={{ color: 'var(--mui-palette-text-secondary)' }} />
            )}
            {message.isFlagged && (
              <Flag
                size={14}
                fill="currentColor"
                style={{ color: 'var(--mui-palette-error-main)' }}
              />
            )}

            {/* Date */}
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ ml: 'auto', fontSize: '0.75rem', flexShrink: 0 }}
            >
              {message.date}
            </Typography>
          </Box>

          {/* Preview (only when collapsed) */}
          {!expanded && (
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{
                fontSize: '0.8125rem',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {message.body.substring(0, 100)}...
            </Typography>
          )}
        </Box>

        {/* Action buttons (visible on hover when collapsed) */}
        {!expanded && showActions && (
          <Box
            sx={{
              display: 'flex',
              gap: 0.5,
              ml: 1,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                onFlag(message.id);
              }}
              sx={{ p: 0.5 }}
            >
              <Flag size={16} />
            </IconButton>
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                onReply(message.id);
              }}
              sx={{ p: 0.5 }}
            >
              <Reply size={16} />
            </IconButton>
            <IconButton size="small" sx={{ p: 0.5 }}>
              <MoreVertical size={16} />
            </IconButton>
          </Box>
        )}
      </AccordionSummary>

      {/* Expanded: Shows full email body */}
      <AccordionDetails sx={{ px: 2, py: 2 }}>
        {/* Recipients */}
        <Box sx={{ mb: 2 }}>
          <Typography variant="caption" color="text.secondary">
            To: {message.to.join(', ')}
          </Typography>
          {message.cc && message.cc.length > 0 && (
            <Typography variant="caption" color="text.secondary" display="block">
              Cc: {message.cc.join(', ')}
            </Typography>
          )}
        </Box>

        {/* Email body */}
        <Typography
          variant="body2"
          sx={{
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            mb: 2,
          }}
        >
          {message.body}
        </Typography>

        {/* Attachments */}
        {message.attachments && message.attachments.length > 0 && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="caption" color="text.secondary" gutterBottom>
              Attachments ({message.attachments.length})
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
              {message.attachments.map((attachment) => (
                <Chip
                  key={attachment.id}
                  icon={<Paperclip size={14} />}
                  label={`${attachment.name} (${Math.round(attachment.size / 1024)}KB)`}
                  size="small"
                  variant="outlined"
                />
              ))}
            </Box>
          </Box>
        )}

        {/* Action buttons */}
        <Box sx={{ display: 'flex', gap: 1, mt: 3 }}>
          <IconButton
            size="small"
            onClick={() => onReply(message.id)}
            sx={{
              border: 1,
              borderColor: 'divider',
              borderRadius: 1,
              px: 1.5,
              py: 0.5,
            }}
          >
            <Reply size={16} style={{ marginRight: 6 }} />
            <Typography variant="caption">Reply</Typography>
          </IconButton>
          <IconButton
            size="small"
            onClick={() => onForward(message.id)}
            sx={{
              border: 1,
              borderColor: 'divider',
              borderRadius: 1,
              px: 1.5,
              py: 0.5,
            }}
          >
            <Forward size={16} style={{ marginRight: 6 }} />
            <Typography variant="caption">Forward</Typography>
          </IconButton>
        </Box>
      </AccordionDetails>
    </Accordion>
  );
}

export default ThreadMessage;
