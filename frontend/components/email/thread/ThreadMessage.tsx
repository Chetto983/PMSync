import React from 'react';
import {
  Box,
  Typography,
  IconButton,
  Avatar,
  Chip,
  Stack,
  Tooltip,
  Collapse,
  Button,
} from '@mui/material';
import {
  ChevronDown,
  Reply,
  ReplyAll,
  Forward,
  Paperclip,
  Trash2,
  MoreHorizontal
} from 'lucide-react';
import { EmailBody } from '../shared/EmailBody';
import { parseEmailFrom } from '../shared/utils';
import type { Email } from '@/stores/email-store';
import type { ParsedCalendarInvite } from '@/types/entities';
import { CalendarInviteCard } from '../CalendarInviteCard';
import { getFileIcon, formatRelativeTime } from './thread-utils';
import type { useTranslations } from '@/lib/hooks/use-translations';

interface ThreadMessageProps {
  email: Email;
  isExpanded: boolean;
  onToggle: () => void;
  onReply?: (email: Email) => void;
  onReplyAll?: (email: Email) => void;
  onForward?: (email: Email) => void;
  onDelete?: (email: Email) => void;
  onAttachmentOpen: (attachment: NonNullable<Email['attachments']>[number], e: React.MouseEvent) => void;
  isDark: boolean;
  onInviteRespond?: (emailId: string, response: 'accept' | 'decline' | 'tentative') => void;
  t: ReturnType<typeof useTranslations>;
}

export const ThreadMessage: React.FC<ThreadMessageProps> = React.memo(
  ({
    email,
    isExpanded,
    onToggle,
    onReply,
    onReplyAll,
    onForward,
    onDelete,
    onAttachmentOpen,
    isDark,
    onInviteRespond,
    t,
  }) => {
    const emailFromData = parseEmailFrom(email.from);
    const emailHtml = email.bodyHtml || email.bodyText || email.snippet || '';
    const nonInlineAttachments = email.attachments?.filter((a) => !a.isInline) ?? [];
    const hasAttachments = nonInlineAttachments.length > 0;
    const isUnread = !email.isRead;
    const unknownSenderLabel = t.email.view.memoryUnknownSender;
    const senderLabel = emailFromData.name || emailFromData.email || unknownSenderLabel;

    // Avatar logic
    const senderInitial = senderLabel.trim().charAt(0).toUpperCase() || '?';
    const avatarColors = ['#55cae5', '#7650ce', '#b43db6', '#4CAF50', '#FF9800', '#E91E63'];
    const colorIndex = emailFromData.email?.charCodeAt(0) % avatarColors.length || 0;
    const avatarColor = avatarColors[colorIndex];

    const formattedDate = formatRelativeTime(email.receivedAt, t.locale, t.timeAgo);
    const fullDate = new Date(email.receivedAt).toLocaleString(t.locale === 'it' ? 'it-IT' : 'en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric'
    });

    return (
      <Box
        sx={{
          mb: 0,
          borderBottom: '1px solid',
          borderColor: 'divider',
          bgcolor: isExpanded ? 'background.paper' : 'transparent',
          position: 'relative',
          transition: 'all 0.1s ease',
        }}
      >
        {/* =================================================================================
            COLLAPSED STATE: COMPACT ROW (List View Style) 
           ================================================================================= */}
        {!isExpanded && (
          <Box
            onClick={onToggle}
            sx={{
              display: 'flex',
              alignItems: 'center',
              px: 2,
              py: 0.5,
              cursor: 'pointer',
              minHeight: 32, // Dense
              gap: 2,
              '&:hover': { bgcolor: 'action.hover' },
            }}
          >
            {/* Sender Name */}
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography
                variant="body2"
                sx={{
                  fontWeight: isUnread ? 700 : 400,
                  fontStyle: (email.folder === 'SENT') ? 'italic' : 'normal',
                  color: 'text.primary',
                  fontSize: '0.9rem',
                  overflow: 'hidden',
                  whiteSpace: 'nowrap',
                  textOverflow: 'ellipsis',
                }}
              >
                {senderLabel}
              </Typography>
            </Box>

            {/* Right: Date + Icons */}
            <Stack direction="row" alignItems="center" spacing={2} sx={{ flexShrink: 0 }}>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{
                  fontSize: '0.8rem',
                  minWidth: 80,
                  textAlign: 'right',
                  fontStyle: (email.folder === 'SENT') ? 'italic' : 'normal',
                }}
              >
                {formattedDate}
              </Typography>

              <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 40, justifyContent: 'flex-end' }}>
                {hasAttachments && <Paperclip size={14} style={{ opacity: 0.7 }} />}
                {/* Replied Icon if applicable */}
                <Reply size={16} color="#7650ce" style={{ opacity: 0.5 }} />
              </Stack>

              <IconButton size="small" sx={{ p: 0.5 }}>
                <ChevronDown size={14} />
              </IconButton>
            </Stack>
          </Box>
        )}


        {/* =================================================================================
            EXPANDED STATE: RICH HEADER (Reading Pane Style)
           ================================================================================= */}
        <Collapse in={isExpanded} timeout="auto" unmountOnExit>
          {/* Rich Header Container */}
          <Box
            onClick={onToggle}
            sx={{
              p: 2,
              pd: 1,
              cursor: 'pointer',
              '&:hover': { bgcolor: 'action.hover' },
              transition: 'background-color 0.1s ease',
            }}
          >
            {/* Top Row: Avatar + Name + Actions */}
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, mb: 1 }}>
              <Avatar
                sx={{
                  width: 42,
                  height: 42,
                  bgcolor: avatarColor,
                  fontSize: '1rem',
                  fontWeight: 600,
                }}
              >
                {senderInitial}
              </Avatar>

              <Box sx={{ flex: 1 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  {/* Name and To */}
                  <Box sx={{ maxWidth: '60%' }}>
                    <Typography variant="h6" sx={{ fontSize: '1rem', fontWeight: 700, lineHeight: 1.2 }}>
                      {senderLabel}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                      To: {email.to?.join(', ') || 'Me'}
                    </Typography>
                  </Box>

                  {/* Top Right Actions Toolbar - Icon Only for cleaner look */}
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    <Tooltip title={t.email.view.reply}>
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          onReply?.(email);
                        }}
                      >
                        <Reply size={18} />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title={t.email.view.replyAll}>
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          onReplyAll?.(email);
                        }}
                      >
                        <ReplyAll size={18} />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title={t.email.view.forward}>
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          onForward?.(email);
                        }}
                      >
                        <Forward size={18} />
                      </IconButton>
                    </Tooltip>

                    <IconButton
                      size="small"
                      sx={{ ml: 1 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        // More actions handler
                      }}
                    >
                      <MoreHorizontal size={18} />
                    </IconButton>
                  </Stack>
                </Box>

                {/* Date Row - Right aligned */}
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 0.5 }}>
                  <Typography variant="caption" color="text.secondary">
                    {fullDate}
                  </Typography>
                </Box>
              </Box>
            </Box>
          </Box>

          {/* Body Content */}
          <Box sx={{ px: 2, pb: 2 }}>
            {/* Calendar */}
            {email.hasCalendarInvite && email.calendarInviteData && (
              <Box sx={{ mb: 2 }}>
                <CalendarInviteCard
                  invite={email.calendarInviteData as ParsedCalendarInvite}
                  status={email.calendarInviteStatus}
                  onRespond={async (response) => {
                    if (onInviteRespond) {
                      await onInviteRespond(email.id, response);
                    }
                  }}
                />
              </Box>
            )}

            <EmailBody
              html={emailHtml}
              isDark={isDark}
              lazyLoadImages={true}
              lazyLoadMargin="200px"
              attachments={email.attachments}
              sx={{ p: 0 }} // No extra padding needed
            />

            {/* Attachments Chips */}
            {hasAttachments && (
              <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
                <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ gap: 1 }}>
                  {nonInlineAttachments.map((attachment) => (
                    <Chip
                      key={attachment.id}
                      label={attachment.filename}
                      size="small"
                      icon={getFileIcon(attachment.filename, 14)}
                      onClick={(e) => onAttachmentOpen(attachment, e)}
                      variant="outlined"
                      sx={{ cursor: 'pointer' }}
                    />
                  ))}
                </Stack>
              </Box>
            )}

            {/* Delete Button (Bottom) */}
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1 }}>
              {onDelete && (
                <Button
                  size="small"
                  color="error"
                  startIcon={<Trash2 size={16} />}
                  onClick={() => onDelete(email)}
                  sx={{ opacity: 0.7 }}
                >
                  {t.email.bulkBar.delete}
                </Button>
              )}
            </Box>
          </Box>
        </Collapse>
      </Box>
    );
  },
);

ThreadMessage.displayName = 'ThreadMessage';

export default ThreadMessage;
