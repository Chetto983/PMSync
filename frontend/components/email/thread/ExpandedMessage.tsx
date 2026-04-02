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

import { memo, useMemo, useState } from 'react';
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
  Chip,
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
  X,
  Sparkles,
  Check,
} from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { stringToColor } from '@/lib/utils/gravatar';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { localizeAiLabel } from '@/lib/email-triage/ai-display';
import { TriageStatusSection } from '@/src/components/triage/TriageStatusSection';
import { useLocale } from '@/lib/hooks/use-locale';
import { EmailHtmlContent } from './EmailHtmlContent';
import { AttachmentCard } from './AttachmentCard';
import { AiInsightsPanel } from './AiInsightsPanel';
import { AiActionButtons } from './AiActionButtons';
import { ContactName } from '@/components/contacts/ContactName';
import { extractEmailAddress } from '@/components/email/utils/email-formatters';

interface ExpandedMessageProps {
  message: {
    id: string;
    from: string;
    to: string[];
    cc?: string[];
    date: string;
    receivedAt?: string;
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
    aiLane?: string | null;
    aiIntent?: string | null;
    aiActionability?: string | null;
    labels?: Array<{ id: string; name: string; color: string }>;
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
  /** Callback when a label is removed from the email */
  onRemoveLabel?: (messageId: string, labelId: string) => void;
  /** Callback when an AI-suggested label is accepted (promote to user label) */
  onAcceptAiLabel?: (messageId: string, labelName: string) => void;
  /** Callback when an AI-suggested label is dismissed */
  onDismissAiLabel?: (messageId: string, labelName: string) => void;
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

function getDatePresentation(receivedAt: string | undefined, fallback: string) {
  if (!receivedAt) {
    return { relative: fallback, absolute: fallback };
  }

  const parsed = new Date(receivedAt);
  if (Number.isNaN(parsed.getTime())) {
    return { relative: fallback, absolute: fallback };
  }

  const now = new Date();
  const diffMs = parsed.getTime() - now.getTime();
  const diffMinutes = Math.round(diffMs / 60000);
  const absolute = new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed);

  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

  if (Math.abs(diffMinutes) < 60) {
    return { relative: rtf.format(diffMinutes, 'minute'), absolute };
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) {
    return { relative: rtf.format(diffHours, 'hour'), absolute };
  }

  const diffDays = Math.round(diffHours / 24);
  if (Math.abs(diffDays) < 7) {
    return { relative: rtf.format(diffDays, 'day'), absolute };
  }

  return { relative: absolute, absolute };
}

function getRecipientSummary(recipients: string[], expanded: boolean, visibleCount: number) {
  if (expanded) {
    return {
      visible: recipients,
      remaining: 0,
    };
  }

  return {
    visible: recipients.slice(0, visibleCount),
    remaining: Math.max(recipients.length - visibleCount, 0),
  };
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
  onRemoveLabel,
  onAcceptAiLabel,
  onDismissAiLabel,
}: ExpandedMessageProps) {
  void onFlag; // Reserved for future use
  const t = useTranslations();
  const { locale } = useLocale();
  const [showAllRecipients, setShowAllRecipients] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

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

  const datePresentation = useMemo(
    () => getDatePresentation(message.receivedAt, message.date),
    [message.date, message.receivedAt],
  );
  const toSummary = useMemo(
    () => getRecipientSummary(message.to, showAllRecipients, 2),
    [message.to, showAllRecipients],
  );
  const ccSummary = useMemo(
    () => getRecipientSummary(message.cc || [], showAllRecipients, 1),
    [message.cc, showAllRecipients],
  );
  const canToggleRecipients =
    message.to.length > 2 || (message.cc?.length ?? 0) > 1;

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
    >
      {/* Subject Line */}
      <Box sx={{ px: { xs: 1.5, sm: 2.5 }, pt: 2, pb: 1 }}>
        <Typography variant="h6" sx={{ fontSize: '1.05rem', fontWeight: 700, lineHeight: 1.4, letterSpacing: '-0.01em' }}>
          {message.subject || '(No Subject)'}
        </Typography>
      </Box>

      <Divider sx={{ opacity: 0.3 }} />

      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: { xs: 1, sm: 1.5 },
          px: { xs: 1.5, sm: 2 },
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

        <Box
          sx={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            alignItems: { xs: 'stretch', sm: 'flex-start' },
            gap: { xs: 0.75, sm: 1.5 },
          }}
        >
          {/* Sender Info */}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            {/* Sender Name */}
            <Tooltip title={message.from} placement="top-start">
              <Box component="span">
                <ContactName
                  name={formatSender(message.from)}
                  email={extractEmailAddress(message.from)}
                  variant="body1"
                  fontWeight={600}
                  fontSize="0.9375rem"
                  sx={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}
                />
              </Box>
            </Tooltip>

            {/* To Recipients */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25, flexWrap: 'wrap' }}>
              <Typography variant="caption" color="text.secondary">
                {t.threadMessage?.to || 'To:'}
              </Typography>
              {toSummary.visible.map((recipient, idx, arr) => (
                <Typography
                  key={idx}
                  variant="caption"
                  color="text.secondary"
                  sx={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}
                >
                  {formatRecipient(recipient)}
                  {idx < arr.length - 1 && ','}
                </Typography>
              ))}
              {!showAllRecipients && toSummary.remaining > 0 && (
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
                  +{toSummary.remaining}
                </Typography>
              )}
            </Box>

            {/* CC Recipients */}
            {message.cc && message.cc.length > 0 && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
                <Typography variant="caption" color="text.secondary">
                  {t.threadMessage?.cc || 'CC:'}
                </Typography>
                {ccSummary.visible.map((recipient, idx, arr) => (
                  <Typography
                    key={idx}
                    variant="caption"
                    color="text.secondary"
                    sx={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}
                  >
                    {formatRecipient(recipient)}
                    {idx < arr.length - 1 && ','}
                  </Typography>
                ))}
                {!showAllRecipients && ccSummary.remaining > 0 && (
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
                    +{ccSummary.remaining}
                  </Typography>
                )}
              </Box>
            )}

            {/* Show less button when expanded */}
            {showAllRecipients && canToggleRecipients && (
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
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: { xs: 'space-between', sm: 'flex-end' },
              gap: 1,
              flexShrink: 0,
              width: { xs: '100%', sm: 'auto' },
              minWidth: 0,
              pt: { xs: 0.25, sm: 0 },
            }}
          >
            {/* Reply/Forward actions — always visible (hover-only is a UX anti-pattern) */}
            <Box sx={{ display: 'flex', gap: { xs: 0.75, sm: 0.25 }, flexShrink: 0 }}>
              <Tooltip title={t.threadMessage?.reply || 'Reply'}>
                <IconButton size="small" aria-label="reply" onClick={() => onReply(message.id)} sx={{ p: { xs: 1, sm: 0.5 } }}>
                  <Reply size={16} />
                </IconButton>
              </Tooltip>
              {onReplyAll && (
                <Tooltip title={t.threadMessage?.replyAll || 'Reply All'}>
                  <IconButton size="small" aria-label="reply-all" onClick={() => onReplyAll(message.id)} sx={{ p: { xs: 1, sm: 0.5 } }}>
                    <ReplyAll size={16} />
                  </IconButton>
                </Tooltip>
              )}
              <Tooltip title={t.threadMessage?.forward || 'Forward'}>
                <IconButton size="small" aria-label="forward" onClick={() => onForward(message.id)} sx={{ p: { xs: 1, sm: 0.5 } }}>
                  <Forward size={16} />
                </IconButton>
              </Tooltip>
            </Box>

            {/* Date */}
            <Tooltip title={datePresentation.absolute}>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{
                  fontSize: '0.75rem',
                  minWidth: 0,
                  overflowWrap: 'anywhere',
                  wordBreak: 'break-word',
                  textAlign: { xs: 'left', sm: 'right' },
                  fontVariantNumeric: 'tabular-nums',
                  cursor: 'default',
                }}
              >
                {datePresentation.relative}
              </Typography>
            </Tooltip>

            {/* Collapse button */}
            <IconButton size="small" onClick={onCollapse} sx={{ p: 0.5, flexShrink: 0 }}>
              <ChevronUp size={18} />
            </IconButton>
          </Box>
        </Box>
      </Box>

      {/* Action Buttons Row - Icon buttons (mobile-style) */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          px: { xs: 1.5, sm: 2 },
          py: 1,
          pl: { xs: 1.5, sm: 7.5 },
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

        {/* Delete Icon Button — guarded by confirmation dialog */}
        {onDelete && (
          <Tooltip title={t.threadActions?.deleteThread || 'Delete'}>
            <IconButton
              size="small"
              onClick={() => setDeleteDialogOpen(true)}
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
        priority={message.aiPriority}
        priorityReason={message.aiPriorityReason}
        sentiment={message.aiSentiment}
        labels={message.aiLabels}
      />

      {/* Triage Status Section */}
      <TriageStatusSection
        emailId={message.id}
        senderEmail={extractEmailAddress(message.from)}
        lane={message.aiLane}
        labels={message.aiLabels}
        priorityReason={message.aiPriorityReason}
        intent={message.aiIntent}
        actionability={message.aiActionability}
      />

      {/* User Labels */}
      {message.labels && message.labels.length > 0 && (
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 0.75,
            px: { xs: 1.5, sm: 2 },
            pl: { xs: 1.5, sm: 7.5 },
            py: 1,
          }}
        >
          {message.labels.map((label) => (
            <Chip
              key={label.id}
              label={localizeAiLabel(label.name, locale)}
              size="small"
              deleteIcon={
                onRemoveLabel ? (
                  <Tooltip title={t.email?.labels?.removeFromEmail || 'Remove label from email'}>
                    <X size={14} />
                  </Tooltip>
                ) : undefined
              }
              onDelete={onRemoveLabel ? () => onRemoveLabel(message.id, label.id) : undefined}
              sx={{
                height: { xs: 28, sm: 22 },
                fontSize: '0.75rem',
                bgcolor: label.color,
                color: 'white',
                '& .MuiChip-label': { px: 0.75 },
                '& .MuiChip-deleteIcon': {
                  color: 'rgba(255,255,255,0.7)',
                  fontSize: { xs: 16, sm: 12 },
                  '&:hover': { color: 'white' },
                },
              }}
            />
          ))}
        </Box>
      )}

      {/* AI-suggested Labels */}
      {message.aiLabels && message.aiLabels.length > 0 && (
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 0.75,
            px: { xs: 1.5, sm: 2 },
            pl: { xs: 1.5, sm: 7.5 },
            py: 1,
            alignItems: 'center',
          }}
        >
          <Sparkles size={14} style={{ color: 'var(--mui-palette-text-disabled)' }} />
          <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>
            {t.email?.labels?.aiSuggestedLabel || 'AI'}
          </Typography>
          {message.aiLabels.map((aiLabel) => (
            <Chip
              key={aiLabel}
              label={localizeAiLabel(aiLabel, locale)}
              size="small"
              variant="outlined"
              deleteIcon={
                onDismissAiLabel ? (
                  <Tooltip title={t.email?.labels?.dismissAiLabel || 'Dismiss'}>
                    <X size={12} />
                  </Tooltip>
                ) : undefined
              }
              onDelete={onDismissAiLabel ? () => onDismissAiLabel(message.id, aiLabel) : undefined}
              onClick={onAcceptAiLabel ? () => onAcceptAiLabel(message.id, aiLabel) : undefined}
              icon={onAcceptAiLabel ? <Check size={12} /> : undefined}
              sx={{
                height: 22,
                fontSize: '0.75rem',
                borderColor: 'text.disabled',
                color: 'text.secondary',
                cursor: onAcceptAiLabel ? 'pointer' : 'default',
                '& .MuiChip-label': { px: 0.75 },
                '& .MuiChip-icon': { color: 'success.main', ml: 0.5 },
                '& .MuiChip-deleteIcon': {
                  color: 'text.disabled',
                  fontSize: 12,
                  '&:hover': { color: 'error.main' },
                },
              }}
            />
          ))}
        </Box>
      )}

      {/* Body — max-width for comfortable line length */}
      <Box sx={{ px: { xs: 1.5, sm: 2.5 }, pb: 2, pl: { xs: 1.5, sm: 7.5 }, maxWidth: { xs: '100%', sm: 720 } }}>
        <EmailHtmlContent html={message.body} attachments={message.attachments} />
      </Box>

      {/* Attachments - TailAdmin Style */}
      {message.attachments && message.attachments.length > 0 && (
        <Box sx={{ px: { xs: 1.5, sm: 2 }, pb: 2, pl: { xs: 1.5, sm: 7.5 } }}>
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

      {/* Delete confirmation dialog */}
      {onDelete && (
        <ConfirmDialog
          open={deleteDialogOpen}
          onClose={() => setDeleteDialogOpen(false)}
          onConfirm={() => { setDeleteDialogOpen(false); onDelete(message.id); }}
          variant="danger"
          title={t.threadActions?.deleteThread || 'Delete'}
          message={t.emailList?.deleteSingleConfirm || 'Are you sure you want to delete this email?'}
          confirmText={t.common?.delete || 'Delete'}
          cancelText={t.common?.cancel || 'Cancel'}
        />
      )}
    </Box>
  );
});

export default ExpandedMessage;
