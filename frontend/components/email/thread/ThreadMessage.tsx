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
  useTheme,
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
    const theme = useTheme();
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
        elevation={isExpanded ? 3 : 0}
        sx={{
          mb: 2, // More space between messages
          border: '1px solid',
          borderColor: isExpanded ? 'primary.main' : 'divider',
          borderRadius: 3, // 12px - Bento style
          overflow: 'hidden',
          transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
          // Remove left border indicator, use dot instead for cleaner look
          bgcolor: isExpanded ? 'background.paper' : alpha(theme.palette.background.paper, 0.6), // Glass-ish when collapsed
          backdropFilter: 'blur(10px)',
          '&:hover': {
            borderColor: isExpanded ? 'primary.main' : 'text.disabled',
            transform: isExpanded ? 'none' : 'translateY(-2px)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
          },
        }}
      >
        {/* Collapsed/Header Row - 2025 Best Practices: 16px+ fonts, 40px avatar, generous padding */}
        <Box
          onClick={onToggle}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            p: 2,
            cursor: 'pointer',
            bgcolor: isExpanded ? alpha(isDark ? '#55cae5' : '#7650ce', 0.04) : 'transparent',
            transition: 'background-color 0.2s ease',
            minHeight: 72, // Ensure consistent row height
            '&:hover': {
              bgcolor: alpha(isDark ? '#55cae5' : '#7650ce', 0.08),
            },
          }}
        >
          <Avatar
            sx={{
              width: 44,
              height: 44,
              bgcolor: avatarColor,
              fontSize: '1rem',
              fontWeight: 600,
            }}
          >
            {senderInitial}
          </Avatar>

          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Stack direction="row" alignItems="center" spacing={1}>
              <Typography
                variant="body1"
                sx={{
                  fontWeight: isUnread ? 600 : 500,
                  color: isUnread ? 'text.primary' : 'text.secondary',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  fontSize: '1rem', // 16px - 2025 best practice minimum
                  lineHeight: 1.5,
                }}
              >
                {senderLabel}
              </Typography>
              {isUnread && (
                <Box
                  sx={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    bgcolor: 'primary.main',
                    flexShrink: 0,
                    boxShadow: '0 0 6px rgba(25, 118, 210, 0.5)',
                  }}
                />
              )}
            </Stack>
            {!isExpanded && (
              <Typography
                variant="body2"
                sx={{
                  display: 'block',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  mt: 0.5,
                  color: isUnread ? 'text.secondary' : alpha(isDark ? '#fff' : '#000', 0.5),
                  fontWeight: isUnread ? 500 : 400,
                  fontSize: '0.9375rem', // 15px for better readability
                  lineHeight: 1.4,
                }}
              >
                {email.snippet || t.email.view.noPreview}
              </Typography>
            )}
          </Box>

          <Stack direction="row" alignItems="center" spacing={1.5} sx={{ flexShrink: 0 }}>
            {hasAttachments && (
              <Tooltip title={t.email.view.attachmentsWithCount.replace('{count}', String(nonInlineAttachments.length))}>
                <Stack direction="row" alignItems="center" spacing={0.5} sx={{ color: 'text.secondary' }}>
                  <Paperclip size={18} />
                  <Typography variant="body2" sx={{ fontSize: '0.875rem' }}>{nonInlineAttachments.length}</Typography>
                </Stack>
              </Tooltip>
            )}
            <Typography variant="body2" color="text.secondary" sx={{ minWidth: 60, textAlign: 'right', fontSize: '0.875rem' }}>
              {formatRelativeTime(email.receivedAt, t.locale, t.timeAgo)}
            </Typography>
            <IconButton size="small" sx={{ p: 0.75 }}>
              {isExpanded ? <ChevronUp size={22} /> : <ChevronDown size={22} />}
            </IconButton>
          </Stack>
        </Box>

        <Collapse in={isExpanded} timeout={200}>
          <Box sx={{ borderTop: '1px solid', borderColor: 'divider' }}>
            {/* Expanded Header - 2025 Best Practices: generous padding, readable fonts */}
            <Box sx={{ px: 3, py: 2, bgcolor: isDark ? alpha('#fff', 0.02) : alpha('#000', 0.01) }}>
              <Stack direction="row" alignItems="flex-start" spacing={2}>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="body1" sx={{ fontWeight: 600, fontSize: '1rem', lineHeight: 1.5 }}>
                    {emailFromData.name}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.875rem', mt: 0.25 }}>
                    {emailFromData.email}
                  </Typography>
                  {email.to && email.to.length > 0 && (
                    <Typography variant="body2" color="text.secondary" display="block" sx={{ mt: 1, fontSize: '0.875rem' }}>
                      <strong>{t.email.composer.toLabel}</strong> {email.to.join(', ')}
                    </Typography>
                  )}
                  {email.cc && email.cc.length > 0 && (
                    <Typography variant="body2" color="text.secondary" display="block" sx={{ fontSize: '0.875rem' }}>
                      <strong>{t.email.composer.ccLabel}</strong> {email.cc.join(', ')}
                    </Typography>
                  )}
                </Box>
                <Stack direction="row" alignItems="center" spacing={0.75}>
                  <Clock size={16} color="gray" />
                  <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.875rem' }}>
                    {formatEmailHeaderDate(email.receivedAt)}
                  </Typography>
                </Stack>
              </Stack>

              {/* Message Action Toolbar - 2025: 44px min touch target, 20px icons */}
              <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mt: 1.5 }}>
                <Tooltip title={email.isStarred ? t.email.bulkBar.removeStar : t.email.bulkBar.addStar}>
                  <IconButton
                    size="medium"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleStar?.(email);
                    }}
                    sx={{ p: 1 }}
                  >
                    <Star
                      size={20}
                      fill={email.isStarred ? '#FFB300' : 'none'}
                      color={email.isStarred ? '#FFB300' : 'currentColor'}
                    />
                  </IconButton>
                </Tooltip>
                {email.folder === 'DRAFTS' || email.isDraft || email.externalId?.startsWith('draft-') ? (
                  <Tooltip title={t.common.edit}>
                    <IconButton size="medium" color="primary" onClick={() => onEditDraft?.(email)} sx={{ p: 1 }}>
                      <Edit size={20} />
                    </IconButton>
                  </Tooltip>
                ) : (
                  <>
                    <Tooltip title={t.email.view.reply}>
                      <IconButton size="medium" onClick={() => onReply?.(email)} sx={{ p: 1 }}>
                        <Reply size={20} />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title={t.email.view.replyAll}>
                      <IconButton size="medium" onClick={() => onReplyAll?.(email)} sx={{ p: 1 }}>
                        <ReplyAll size={20} />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title={t.email.view.forward}>
                      <IconButton size="medium" onClick={() => onForward?.(email)} sx={{ p: 1 }}>
                        <Forward size={20} />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title={t.email.bulkBar.archive}>
                      <IconButton size="medium" onClick={() => onArchive?.(email)} sx={{ p: 1 }}>
                        <Archive size={20} />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title={t.email.bulkBar.delete}>
                      <IconButton size="medium" onClick={() => onDelete?.(email)} sx={{ p: 1 }}>
                        <Trash2 size={20} />
                      </IconButton>
                    </Tooltip>
                  </>
                )}
              </Stack>
            </Box>

            {email.hasCalendarInvite && email.calendarInviteData && (
              <Box
                sx={{
                  px: 3,
                  py: 2,
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
                  px: 3,
                  py: 2,
                  bgcolor: isDark ? alpha('#fff', 0.02) : alpha('#000', 0.01),
                  borderTop: '1px solid',
                  borderColor: 'divider',
                }}
              >
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
                  <Paperclip size={18} />
                  <Typography variant="body2" fontWeight={600} sx={{ fontSize: '0.875rem' }}>
                    {t.email.view.attachmentsWithCount.replace('{count}', String(nonInlineAttachments.length))}
                  </Typography>
                </Stack>
                <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ gap: 1 }}>
                  {nonInlineAttachments.map((attachment) => {
                    const sizeLabel = formatFileSize(attachment.size, t.locale);
                    return (
                      <Tooltip key={attachment.id} title={attachmentTooltip} enterDelay={300}>
                        <Chip
                          label={`${attachment.filename} (${sizeLabel})`}
                          size="medium"
                          icon={getFileIcon(attachment.filename, 16)}
                          onClick={(e) => onAttachmentOpen(attachment, e)}
                          sx={{
                            cursor: 'pointer',
                            height: 36,
                            fontSize: '0.875rem',
                            '&:hover': { bgcolor: 'action.hover' }
                          }}
                        />
                      </Tooltip>
                    );
                  })}
                </Stack>
              </Box>
            )}

            {/* Email Body - 2025 Best Practices: 16px font, 1.5 line-height, generous padding */}
            <EmailBody
              html={emailHtml}
              isDark={isDark}
              lazyLoadImages={true}
              lazyLoadMargin="200px"
              attachments={email.attachments}
              sx={{ p: 3 }}
            />
          </Box>
        </Collapse>
      </Paper>
    );
  },
);

ThreadMessage.displayName = 'ThreadMessage';

export default ThreadMessage;
