import React, { useMemo, useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Button,
  Avatar,
  Chip,
  Paper,
  Stack,
  CircularProgress,
  Divider,
  Tooltip,
  useTheme,
  Collapse,
  alpha,
} from '@mui/material';
import {
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Star,
  Archive,
  Trash2,
  MoreVertical,
  Reply,
  ReplyAll,
  Forward,
  Paperclip,
  FileText,
  Image as ImageIcon,
  Video,
  Music,
  FileSpreadsheet,
  FileCode,
  FileArchive,
  File,
  Clock,
  Mail,
  Edit,
} from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useEmailStore, type Email } from '@/stores/email-store';
import { LabelSelector } from '@/components/labels';
import { useLabelStore } from '@/stores/label-store';
import { formatEmailHeaderDate, parseEmailFrom, scrollContainerSx } from './shared/utils';
import { emailApi } from '@/lib/api/email';
import { logger } from '@/lib/logger';
import { EmailSummaryPanel } from '@/components/email/ai/EmailSummaryPanel';
import { EmailBody } from './shared/EmailBody';
import type { ParsedCalendarInvite } from '@/types/entities';
import { CalendarInviteCard } from '@/components/email/CalendarInviteCard';

/**
 * Props for ThreadDisplay component
 */
interface ThreadDisplayProps {
  email: Email | null;
  isLoading?: boolean;
  onClose?: () => void;
  onToggleStar?: (id: string, isStarred: boolean) => void;
  onArchive?: (id: string) => void;
  onDelete?: (id: string) => void;
  onReply?: (email: Email) => void;
  onReplyAll?: (email: Email) => void;
  onForward?: (email: Email) => void;
  onLabelsChange?: (emailId: string, labelIds: string[], updatedEmail?: Email) => void;
  /** Callback when user wants to edit a draft */
  onEditDraft?: (email: Email) => void;
}

/**
 * Get appropriate icon based on file extension
 */
function getFileIcon(filename: string, size = 14): React.ReactElement {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  if (['pdf', 'doc', 'docx', 'txt', 'rtf', 'odt'].includes(ext)) return <FileText size={size} />;
  if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp', 'ico'].includes(ext)) return <ImageIcon size={size} />;
  if (['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'mkv', 'mpeg', 'mpg'].includes(ext)) return <Video size={size} />;
  if (['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma'].includes(ext)) return <Music size={size} />;
  if (['xls', 'xlsx', 'csv', 'ods'].includes(ext)) return <FileSpreadsheet size={size} />;
  if (['js', 'ts', 'tsx', 'jsx', 'html', 'css', 'json', 'xml', 'py', 'java', 'cpp', 'c', 'php', 'rb', 'go', 'rs', 'swift'].includes(ext)) return <FileCode size={size} />;
  if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz'].includes(ext)) return <FileArchive size={size} />;
  return <File size={size} />;
}

/**
 * Format relative time for compact display
 */
function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Collapsible Email Message Component
 */
interface ThreadMessageProps {
  email: Email;
  isExpanded: boolean;
  onToggle: () => void;
  onReply?: (email: Email) => void;
  onReplyAll?: (email: Email) => void;
  onForward?: (email: Email) => void;
  onEditDraft?: (email: Email) => void;
  onAttachmentOpen: (attachment: NonNullable<Email['attachments']>[number], e: React.MouseEvent) => void;
  attachmentTooltip: string;
  isDark: boolean;
  onInviteRespond?: (emailId: string, response: 'accept' | 'decline' | 'tentative') => void;
  t: ReturnType<typeof useTranslations>;
}

const ThreadMessage: React.FC<ThreadMessageProps> = React.memo(({
  email,
  isExpanded,
  onToggle,
  onReply,
  onReplyAll,
  onForward,
  onEditDraft,
  onAttachmentOpen,
  attachmentTooltip,
  isDark,
  onInviteRespond,
  t,
}) => {
  const emailFromData = parseEmailFrom(email.from);
  const emailHtml = email.bodyHtml || email.bodyText || email.snippet || '';



  // DEBUG: Log body data received in ThreadMessage
  // logger.debug('[ThreadMessage] Body data:', {
  //   emailId: email.id,
  //   subject: email.subject?.substring(0, 30),
  //   bodyHtmlLength: email.bodyHtml?.length || 0,
  //   bodyTextLength: email.bodyText?.length || 0,
  //   snippetLength: email.snippet?.length || 0,
  //   emailHtmlLength: emailHtml.length,
  // });
  const nonInlineAttachments = email.attachments?.filter((a) => !a.isInline) ?? [];
  const hasAttachments = nonInlineAttachments.length > 0;
  const isUnread = !email.isRead;

  // Generate avatar color based on email
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
        // Unread indicator - left border accent
        borderLeft: isUnread ? '3px solid' : '1px solid',
        borderLeftColor: isUnread ? 'primary.main' : isExpanded ? 'primary.main' : 'divider',
        // Subtle background for unread
        bgcolor: isUnread && !isExpanded ? alpha(isDark ? '#55cae5' : '#7650ce', 0.03) : 'background.paper',
        '&:hover': {
          borderColor: isExpanded ? 'primary.main' : 'primary.light',
          boxShadow: isExpanded ? 3 : 1,
          transform: isExpanded ? 'none' : 'translateX(2px)',
        },
      }}
    >
      {/* Compact Header - Always visible */}
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
        {/* Avatar */}
        <Avatar
          sx={{
            width: 36,
            height: 36,
            bgcolor: avatarColor,
            fontSize: '0.875rem',
            fontWeight: 600,
          }}
        >
          {emailFromData.name?.[0]?.toUpperCase() || 'U'}
        </Avatar>

        {/* Sender & Preview */}
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
              {emailFromData.name || emailFromData.email}
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
              {email.snippet || '(No preview)'}
            </Typography>
          )}
        </Box>

        {/* Right side: Attachments, Time, Expand icon */}
        <Stack direction="row" alignItems="center" spacing={1} sx={{ flexShrink: 0 }}>
          {hasAttachments && (
            <Tooltip title={`${nonInlineAttachments.length} attachment${nonInlineAttachments.length > 1 ? 's' : ''}`}>
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

      {/* Expanded Content */}
      <Collapse in={isExpanded} timeout={200}>
        <Box sx={{ borderTop: '1px solid', borderColor: 'divider' }}>
          {/* Full Header */}
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
                    <strong>To:</strong> {email.to.join(', ')}
                  </Typography>
                )}
                {email.cc && email.cc.length > 0 && (
                  <Typography variant="caption" color="text.secondary" display="block">
                    <strong>Cc:</strong> {email.cc.join(', ')}
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

            {/* Quick Actions */}
            <Stack direction="row" spacing={0.5} sx={{ mt: 1 }}>
              {/* Show Edit button for drafts */}
              {(email.folder === 'DRAFTS' || email.isDraft || email.externalId?.startsWith('draft-')) && onEditDraft ? (
                <Button
                  size="small"
                  variant="contained"
                  color="primary"
                  startIcon={<Edit size={14} />}
                  onClick={(e) => { e.stopPropagation(); onEditDraft(email); }}
                  sx={{ textTransform: 'none' }}
                >
                  Edit
                </Button>
              ) : (
                <>
                  <Tooltip title={t.email.view?.reply || 'Reply'}>
                    <IconButton size="small" onClick={() => onReply?.(email)}>
                      <Reply size={16} />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title={t.email.view?.replyAll || 'Reply All'}>
                    <IconButton size="small" onClick={() => onReplyAll?.(email)}>
                      <ReplyAll size={16} />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title={t.email.view?.forward || 'Forward'}>
                    <IconButton size="small" onClick={() => onForward?.(email)}>
                      <Forward size={16} />
                    </IconButton>
                  </Tooltip>
                </>
              )}
            </Stack>
          </Box>

          {/* Calendar Invitation */}
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

          {/* Attachments */}
          {hasAttachments && (
            <Box sx={{ px: 2, py: 1.5, bgcolor: isDark ? alpha('#fff', 0.02) : alpha('#000', 0.01), borderTop: '1px solid', borderColor: 'divider' }}>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                <Paperclip size={14} />
                <Typography variant="caption" fontWeight={600}>
                  {nonInlineAttachments.length} Attachment{nonInlineAttachments.length > 1 ? 's' : ''}
                </Typography>
              </Stack>
              <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ gap: 0.5 }}>
                {nonInlineAttachments.map((attachment) => {
                  const sizeKB = Math.round(attachment.size / 1024);
                  const sizeLabel = sizeKB > 1024 ? `${(sizeKB / 1024).toFixed(1)} MB` : `${sizeKB} KB`;
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

          {/* Email Body - with lazy loaded images */}
          <EmailBody
            html={emailHtml}
            isDark={isDark}
            lazyLoadImages={true}
            lazyLoadMargin="200px"
            sx={{ p: 2 }}
          />
        </Box>
      </Collapse>
    </Paper>
  );
});

// Display name for debugging
ThreadMessage.displayName = 'ThreadMessage';

/**
 * ThreadDisplay - Modern collapsible email thread viewer
 * Inspired by Gmail, Outlook, and Apple Mail
 */
export const ThreadDisplay: React.FC<ThreadDisplayProps> = ({
  email,
  isLoading = false,
  onClose,
  onToggleStar,
  onArchive,
  onDelete,
  onReply,
  onReplyAll,
  onForward,
  onLabelsChange,
  onEditDraft,
}) => {
  const t = useTranslations();
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const { addEmailsToLabel, removeEmailFromLabel } = useLabelStore();
  const translations = t as { dashboard?: { email?: { attachments?: { tooltip?: string } }; emailView?: { fetchArchived?: string } } };
  const attachmentTooltip = translations?.dashboard?.email?.attachments?.tooltip ?? 'Click to open. Ctrl/Cmd+click to download.';
  const [threadData, setThreadData] = useState<Email[]>([]);
  const [expandedEmails, setExpandedEmails] = useState<Set<string>>(new Set());
  const emailStore = useEmailStore();

  type Attachment = NonNullable<Email['attachments']>[number];

  const handleAttachmentOpen = async (attachment: Attachment, e: React.MouseEvent) => {
    try {
      const response = await emailApi.downloadAttachment(attachment.id);
      const blob = response.data;
      const url = window.URL.createObjectURL(blob);

      if (e.ctrlKey || e.metaKey) {
        const a = document.createElement('a');
        a.href = url;
        a.download = attachment.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      } else {
        const newWindow = window.open(url, '_blank');
        if (newWindow) {
          newWindow.addEventListener('load', () => setTimeout(() => window.URL.revokeObjectURL(url), 100));
        } else {
          const a = document.createElement('a');
          a.href = url;
          a.download = attachment.filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          window.URL.revokeObjectURL(url);
        }
      }
    } catch (error) {
      logger.error('Failed to open attachment:', { error });
    }
  };

  // Thread emails calculation - merge and deduplicate from local and API sources
  const threadEmails = useMemo(() => {
    if (!email) return [];

    const local = emailStore.getEmailThread(email.id);
    const apiData = threadData;

    // Merge both sources and deduplicate by email ID
    const emailMap = new Map<string, Email>();

    // Add local emails first
    for (const e of local) {
      emailMap.set(e.id, e);
    }

    // Add API emails (will override local if same ID)
    for (const e of apiData) {
      emailMap.set(e.id, e);
    }

    // Convert to array and sort by receivedAt
    const merged = Array.from(emailMap.values());

    // If no emails found, fallback to selected email
    if (merged.length === 0) {
      return [email];
    }

    return merged.sort((a, b) => new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime());
  }, [email, emailStore, threadData]);

  const handleInviteRespond = useCallback(
    async (emailId: string, response: 'accept' | 'decline' | 'tentative') => {
      const status =
        response === 'accept' ? 'accepted' : response === 'decline' ? 'declined' : 'tentative';
      try {
        await emailApi.respondToCalendarInvite(emailId, response);

      } catch (err) {
        logger.error('Failed to respond to calendar invite', { error: err });
      } finally {
        emailStore.updateEmail(emailId, { calendarInviteStatus: status });
      }
    },
    [emailStore],
  );

  // Load thread from API if needed
  useEffect(() => {
    const loadThread = async () => {
      if (!email || !email.threadId) return;

      // Check local store for thread emails
      const existing = emailStore.getEmailThread(email.id);

      // If we have more than 1 email locally, we likely have the full thread
      if (existing.length > 1) {
        setThreadData([]);
        return;
      }

      try {
        const res = await emailApi.getThread(email.threadId);
        if (res.data && res.data.length > existing.length) {
          setThreadData(res.data);
        }
      } catch {
        // ignore - fall back to local data
      }
    };
    loadThread();
  }, [email, emailStore]);

  // Auto-expand: unread emails + last email (like Gmail/Outlook)
  useEffect(() => {
    if (threadEmails.length > 0) {
      const toExpand = new Set<string>();
      // Always expand the last email
      toExpand.add(threadEmails[threadEmails.length - 1].id);
      // Also expand any unread emails
      threadEmails.forEach((e) => {
        if (!e.isRead) toExpand.add(e.id);
      });
      setExpandedEmails(toExpand);
    }
  }, [threadEmails]);

  const handleFetchArchived = async () => {
    if (!email) return;
    try {
      const res = await emailApi.fetchArchivedEmail(email.id);
      setThreadData([res.data]);
    } catch {
      // ignore
    }
  };

  const toggleEmail = (emailId: string) => {
    setExpandedEmails((prev) => {
      const next = new Set(prev);
      if (next.has(emailId)) {
        next.delete(emailId);
      } else {
        next.add(emailId);
      }
      return next;
    });
  };

  const expandAll = () => setExpandedEmails(new Set(threadEmails.map((e) => e.id)));
  const collapseAll = () => {
    if (threadEmails.length > 0) {
      setExpandedEmails(new Set([threadEmails[threadEmails.length - 1].id]));
    }
  };
  // Collapse read messages - keep only unread + last expanded
  const collapseRead = () => {
    if (threadEmails.length > 0) {
      const toExpand = new Set<string>();
      toExpand.add(threadEmails[threadEmails.length - 1].id);
      threadEmails.forEach((e) => {
        if (!e.isRead) toExpand.add(e.id);
      });
      setExpandedEmails(toExpand);
    }
  };

  const primaryEmail = threadEmails[0] || email;
  const isThreadConversation = threadEmails.length > 1;
  const unreadCount = threadEmails.filter((e) => !e.isRead).length;

  const handleLabelsChange = async (labelIds: string[]) => {
    if (!email) return;
    const currentLabels = email.emailLabels?.map((el) => el.label.id) || [];
    const added = labelIds.filter((id) => !currentLabels.includes(id));
    const removed = currentLabels.filter((id) => !labelIds.includes(id));

    try {
      let updatedEmail = email;
      if (added.length > 0) {
        for (const labelId of added) {
          const result = await addEmailsToLabel(labelId, [email.id]);
          if (result.emails && result.emails.length > 0) updatedEmail = result.emails[0];
        }
      }
      if (removed.length > 0) {
        for (const labelId of removed) {
          const result = await removeEmailFromLabel(labelId, email.id);
          if (result.email) updatedEmail = result.email;
        }
      }
      onLabelsChange?.(email.id, labelIds, updatedEmail);
      setThreadData((prev) => {
        if (!prev || prev.length === 0) return updatedEmail ? [updatedEmail] : prev;
        return prev.map((item) => (item.id === email.id ? updatedEmail : item));
      });
    } catch (error) {
      logger.error('Failed to update labels:', { error });
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', minHeight: 400 }}>
        <CircularProgress />
      </Box>
    );
  }

  // Empty state
  if (!email) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100%',
          minHeight: 400,
          px: 3,
          textAlign: 'center',
        }}
      >
        <Mail size={48} color={isDark ? '#55cae5' : '#7650ce'} strokeWidth={1.5} />
        <Typography variant="h6" color="text.secondary" sx={{ mt: 2 }}>
          {t.email.selectEmail}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, opacity: 0.7 }}>
          Select an email to read
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Toolbar */}
      <Paper
        elevation={0}
        sx={{
          px: { xs: 1, sm: 2 },
          py: 1.5,
          borderBottom: 1,
          borderColor: 'divider',
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          flexShrink: 0,
          flexWrap: 'wrap',
        }}
      >
        {onClose && (
          <IconButton size="small" onClick={onClose} sx={{ mr: 0.5 }} aria-label={t.common.close || 'Close'}>
            <ChevronLeft size={20} />
          </IconButton>
        )}

        <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

        {/* Edit Draft button - shows for drafts */}
        {(email.folder === 'DRAFTS' || email.isDraft || email.externalId?.startsWith('draft-')) && onEditDraft && (
          <Tooltip title={t.common?.edit || 'Edit Draft'}>
            <Button
              size="small"
              variant="contained"
              color="primary"
              startIcon={<Edit size={16} />}
              onClick={() => onEditDraft(email)}
              sx={{ mr: 1 }}
            >
              {t.common?.edit || 'Edit'}
            </Button>
          </Tooltip>
        )}

        {/* Hide Reply/Forward for drafts since they should be edited instead */}
        {!(email.folder === 'DRAFTS' || email.isDraft || email.externalId?.startsWith('draft-')) && (
          <>
            <Tooltip title={t.email.view.reply}>
              <IconButton size="small" onClick={() => onReply?.(email)}>
                <Reply size={18} />
              </IconButton>
            </Tooltip>
            <Tooltip title={t.email.view.replyAll}>
              <IconButton size="small" onClick={() => onReplyAll?.(email)}>
                <ReplyAll size={18} />
              </IconButton>
            </Tooltip>
            <Tooltip title={t.email.view.forward}>
              <IconButton size="small" onClick={() => onForward?.(email)}>
                <Forward size={18} />
              </IconButton>
            </Tooltip>
          </>
        )}

        <Box sx={{ flex: 1 }} />

        <Tooltip title={email.isStarred ? t.email.bulkBar.removeStar : t.email.bulkBar.addStar}>
          <IconButton size="small" onClick={() => onToggleStar?.(email.id, email.isStarred || false)}>
            <Star size={18} fill={email.isStarred ? '#FFB300' : 'none'} color={email.isStarred ? '#FFB300' : 'currentColor'} />
          </IconButton>
        </Tooltip>
        <Tooltip title={t.email.bulkBar.archive}>
          <IconButton size="small" onClick={() => onArchive?.(email.id)}>
            <Archive size={18} />
          </IconButton>
        </Tooltip>
        <Tooltip title={t.email.bulkBar.delete}>
          <IconButton size="small" onClick={() => onDelete?.(email.id)}>
            <Trash2 size={18} />
          </IconButton>
        </Tooltip>

        <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

        <Tooltip title={t.email.view.more}>
          <IconButton size="small">
            <MoreVertical size={18} />
          </IconButton>
        </Tooltip>
      </Paper>

      {/* Content Area */}
      <Box sx={{ flex: 1, overflow: 'auto', ...scrollContainerSx }}>
        {/* Subject Header */}
        <Box sx={{ px: { xs: 2, sm: 3 }, pt: { xs: 2, sm: 3 }, pb: 2 }}>
          <Typography
            variant="h5"
            sx={{
              fontWeight: 600,
              lineHeight: 1.3,
              mb: 1,
              fontSize: { xs: '1.25rem', sm: '1.5rem' },
              wordBreak: 'break-word',
            }}
          >
            {primaryEmail.subject || '(No subject)'}
          </Typography>

          {/* Thread info & controls */}
          <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" sx={{ mb: 2 }}>
            {isThreadConversation && (
              <>
                <Chip
                  icon={<Mail size={14} />}
                  label={`${threadEmails.length} messages`}
                  size="small"
                  sx={{ fontWeight: 500 }}
                />
                {unreadCount > 0 && (
                  <Chip
                    label={`${unreadCount} unread`}
                    size="small"
                    color="primary"
                    sx={{ fontWeight: 600 }}
                  />
                )}
                <Divider orientation="vertical" flexItem sx={{ mx: 0.5, height: 20, alignSelf: 'center' }} />
                <Button size="small" variant="text" onClick={expandAll} sx={{ minWidth: 'auto', px: 1, fontSize: '0.75rem' }}>
                  Expand all
                </Button>
                <Button size="small" variant="text" onClick={collapseRead} sx={{ minWidth: 'auto', px: 1, fontSize: '0.75rem' }}>
                  Collapse read
                </Button>
                <Button size="small" variant="text" onClick={collapseAll} sx={{ minWidth: 'auto', px: 1, fontSize: '0.75rem' }}>
                  Collapse all
                </Button>
              </>
            )}
          </Stack>

          {/* Labels */}
          {onLabelsChange && email && (
            <Box sx={{ mb: 2 }}>
              <LabelSelector
                selectedLabelIds={email.emailLabels?.map((el) => el.label.id) || []}
                selectedLabels={email.emailLabels?.map((el) => el.label) || []}
                onLabelsChange={handleLabelsChange}
                variant="chips"
              />
            </Box>
          )}

          {/* AI Summary Panel */}
          {primaryEmail && (
            <Box sx={{ mb: 2 }}>
              <EmailSummaryPanel
                emailId={primaryEmail.id}
                defaultExpanded={false}
                showExtractedItems={true}
              />
            </Box>
          )}

          {/* Load archived content button */}
          {!primaryEmail.bodyHtml && !primaryEmail.bodyText && (
            <Button variant="outlined" size="small" onClick={handleFetchArchived} sx={{ mb: 2 }}>
              {translations?.dashboard?.emailView?.fetchArchived || 'Load archived content'}
            </Button>
          )}
        </Box>

        {/* Thread Messages */}
        <Box sx={{ px: { xs: 2, sm: 3 }, pb: 3 }}>
          {threadEmails.map((threadEmail) => (
            <ThreadMessage
              key={threadEmail.id}
              email={threadEmail}
              isExpanded={expandedEmails.has(threadEmail.id)}
              onToggle={() => toggleEmail(threadEmail.id)}
              onReply={onReply}
              onReplyAll={onReplyAll}
              onForward={onForward}
              onEditDraft={onEditDraft}
              onAttachmentOpen={handleAttachmentOpen}
              attachmentTooltip={attachmentTooltip}
              isDark={isDark}
              onInviteRespond={handleInviteRespond}
              t={t}
            />
          ))}
        </Box>
      </Box>
    </Box >
  );
};

export default ThreadDisplay;
