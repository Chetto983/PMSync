import React from 'react';
import {
  Box,
  Typography,
  IconButton,
  Avatar,
  Chip,
  Paper,
  Stack,
  Tooltip,
  Collapse,
  alpha,
} from '@mui/material';
import {
  ChevronDown,
  ChevronUp,
  Reply,
  ReplyAll,
  Forward,
  Paperclip,
  Clock,
  Edit,
  Archive,
  Trash2,
  Star,
} from 'lucide-react';
import { EmailBody } from '../shared/EmailBody';
import { formatEmailHeaderDate, parseEmailFrom } from '../shared/utils';
import type { Email } from '@/stores/email-store';
import type { ParsedCalendarInvite } from '@/types/entities';
import { CalendarInviteCard } from '../CalendarInviteCard';
import { getFileIcon, formatRelativeTime } from './thread-utils';
import { formatFileSize } from '@/lib/utils/format-file-size';
import type { useTranslations } from '@/lib/hooks/use-translations';

interface ThreadMessageProps {
  email: Email;
  isExpanded: boolean;
  onToggle: () => void;
  onReply?: (email: Email) => void;
  onReplyAll?: (email: Email) => void;
  onForward?: (email: Email) => void;
  onEditDraft?: (email: Email) => void;
  onArchive?: (email: Email) => void;
  onDelete?: (email: Email) => void;
  onToggleStar?: (email: Email) => void;
  onAttachmentOpen: (attachment: NonNullable<Email['attachments']>[number], e: React.MouseEvent) => void;
  attachmentTooltip: string;
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
    onEditDraft,
    onArchive,
    onDelete,
    onToggleStar,
    onAttachmentOpen,
    attachmentTooltip,
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
    const senderInitial =
      senderLabel.trim().charAt(0).toUpperCase() || unknownSenderLabel.trim().charAt(0).toUpperCase();

    const avatarColors = ['#55cae5', '#7650ce', '#b43db6', '#4CAF50', '#FF9800', '#E91E63'];
    const colorIndex = emailFromData.email?.charCodeAt(0) % avatarColors.length || 0;
    const avatarColor = avatarColors[colorIndex];

    return (
      <Paper
        elevation={isExpanded ? 2 : 0}
        sx={{
          mb: 1.5,
          border: '1px solid',
          borderColor: isExpanded ? 'primary.main' : isUnread ? 'primary.light' : 'divider',
          borderRadius: 2,
          overflow: 'hidden',
          transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
          borderLeft: isUnread ? '3px solid' : '1px solid',
          borderLeftColor: isUnread ? 'primary.main' : isExpanded ? 'primary.main' : 'divider',
          bgcolor: isUnread && !isExpanded ? alpha(isDark ? '#55cae5' : '#7650ce', 0.03) : 'background.paper',
          '&:hover': {
            borderColor: isExpanded ? 'primary.main' : 'primary.light',
            boxShadow: isExpanded ? 3 : 1,
            transform: isExpanded ? 'none' : 'translateX(2px)',
          },
        }}
      >
        <Box
          onClick={onToggle}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            p: 1.5,
            cursor: 'pointer',
            bgcolor: isExpanded ? alpha(isDark ? '#55cae5' : '#7650ce', 0.04) : 'transparent',
            transition: 'background-color 0.2s ease',
            '&:hover': {
              bgcolor: alpha(isDark ? '#55cae5' : '#7650ce', 0.08),
            },
          }}
        >
          <Avatar
            sx={{
              width: 36,
              height: 36,
              bgcolor: avatarColor,
              fontSize: '0.875rem',
              fontWeight: 600,
            }}
          >
            {senderInitial}
          </Avatar>

          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Stack direction="row" alignItems="center" spacing={1}>
              <Typography
                variant="body2"
                sx={{
                  fontWeight: isUnread ? 700 : 500,
                  color: isUnread ? 'text.primary' : 'text.secondary',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {senderLabel}
              </Typography>
              {isUnread && (
                <Box
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    bgcolor: 'primary.main',
                    flexShrink: 0,
                    boxShadow: '0 0 4px rgba(25, 118, 210, 0.5)',
                  }}
                />
              )}
            </Stack>
            {!isExpanded && (
              <Typography
                variant="caption"
                sx={{
                  display: 'block',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  mt: 0.25,
                  color: isUnread ? 'text.secondary' : alpha(isDark ? '#fff' : '#000', 0.5),
                  fontWeight: isUnread ? 500 : 400,
                }}
              >
                {email.snippet || t.email.view.noPreview}
              </Typography>
            )}
          </Box>

          <Stack direction="row" alignItems="center" spacing={1} sx={{ flexShrink: 0 }}>
            {hasAttachments && (
              <Tooltip title={t.email.view.attachmentsWithCount.replace('{count}', String(nonInlineAttachments.length))}>
                <Stack direction="row" alignItems="center" spacing={0.5} sx={{ color: 'text.secondary' }}>
                  <Paperclip size={14} />
                  <Typography variant="caption">{nonInlineAttachments.length}</Typography>
                </Stack>
              </Tooltip>
            )}
            <Typography variant="caption" color="text.secondary" sx={{ minWidth: 50, textAlign: 'right' }}>
              {formatRelativeTime(email.receivedAt)}
            </Typography>
            <IconButton size="small" sx={{ p: 0.5 }}>
              {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </IconButton>
          </Stack>
        </Box>

        <Collapse in={isExpanded} timeout={200}>
          <Box sx={{ borderTop: '1px solid', borderColor: 'divider' }}>
            <Box sx={{ px: 2, py: 1.5, bgcolor: isDark ? alpha('#fff', 0.02) : alpha('#000', 0.01) }}>
              <Stack direction="row" alignItems="flex-start" spacing={2}>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {emailFromData.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {emailFromData.email}
                  </Typography>
                  {email.to && email.to.length > 0 && (
                    <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                      <strong>{t.email.composer.toLabel}</strong> {email.to.join(', ')}
                    </Typography>
                  )}
                  {email.cc && email.cc.length > 0 && (
                    <Typography variant="caption" color="text.secondary" display="block">
                      <strong>{t.email.composer.ccLabel}</strong> {email.cc.join(', ')}
                    </Typography>
                  )}
                </Box>
                <Stack direction="row" alignItems="center" spacing={0.5}>
                  <Clock size={12} color="gray" />
                  <Typography variant="caption" color="text.secondary">
                    {formatEmailHeaderDate(email.receivedAt)}
                  </Typography>
                </Stack>
              </Stack>

              {/* Message Action Toolbar - Icon only */}
              <Stack direction="row" alignItems="center" spacing={0.5} sx={{ ml: 'auto' }}>
                <Tooltip title={email.isStarred ? t.email.bulkBar.removeStar : t.email.bulkBar.addStar}>
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleStar?.(email);
                    }}
                  >
                    <Star
                      size={16}
                      fill={email.isStarred ? '#FFB300' : 'none'}
                      color={email.isStarred ? '#FFB300' : 'currentColor'}
                    />
                  </IconButton>
                </Tooltip>
                {email.folder === 'DRAFTS' || email.isDraft || email.externalId?.startsWith('draft-') ? (
                  <Tooltip title={t.common.edit}>
                    <IconButton size="small" color="primary" onClick={() => onEditDraft?.(email)}>
                      <Edit size={16} />
                    </IconButton>
                  </Tooltip>
                ) : (
                  <>
                    <Tooltip title={t.email.view.reply}>
                      <IconButton size="small" onClick={() => onReply?.(email)}>
                        <Reply size={16} />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title={t.email.view.replyAll}>
                      <IconButton size="small" onClick={() => onReplyAll?.(email)}>
                        <ReplyAll size={16} />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title={t.email.view.forward}>
                      <IconButton size="small" onClick={() => onForward?.(email)}>
                        <Forward size={16} />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title={t.email.bulkBar.archive}>
                      <IconButton size="small" onClick={() => onArchive?.(email)}>
                        <Archive size={16} />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title={t.email.bulkBar.delete}>
                      <IconButton size="small" onClick={() => onDelete?.(email)}>
                        <Trash2 size={16} />
                      </IconButton>
                    </Tooltip>
                  </>
                )}
              </Stack>
            </Box>

            {email.hasCalendarInvite && email.calendarInviteData && (
              <Box
                sx={{
                  px: 2,
                  py: 1.5,
                  borderTop: '1px solid',
                  borderColor: 'divider',
                  bgcolor: isDark ? alpha('#fff', 0.02) : alpha('#000', 0.01),
                }}
              >
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

            {hasAttachments && (
              <Box
                sx={{
                  px: 2,
                  py: 1.5,
                  bgcolor: isDark ? alpha('#fff', 0.02) : alpha('#000', 0.01),
                  borderTop: '1px solid',
                  borderColor: 'divider',
                }}
              >
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                  <Paperclip size={14} />
                  <Typography variant="caption" fontWeight={600}>
                    {t.email.view.attachmentsWithCount.replace('{count}', String(nonInlineAttachments.length))}
                  </Typography>
                </Stack>
                <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ gap: 0.5 }}>
                  {nonInlineAttachments.map((attachment) => {
                    const sizeLabel = formatFileSize(attachment.size, t.locale);
                    return (
                      <Tooltip key={attachment.id} title={attachmentTooltip} enterDelay={300}>
                        <Chip
                          label={`${attachment.filename} (${sizeLabel})`}
                          size="small"
                          icon={getFileIcon(attachment.filename, 12)}
                          onClick={(e) => onAttachmentOpen(attachment, e)}
                          sx={{ cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
                        />
                      </Tooltip>
                    );
                  })}
                </Stack>
              </Box>
            )}

              <EmailBody
                html={emailHtml}
                isDark={isDark}
                lazyLoadImages={true}
                lazyLoadMargin="200px"
                attachments={email.attachments}
                sx={{ p: 2 }}
              />
          </Box>
        </Collapse>
      </Paper>
    );
  },
);

ThreadMessage.displayName = 'ThreadMessage';

export default ThreadMessage;
