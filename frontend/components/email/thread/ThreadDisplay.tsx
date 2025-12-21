import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Button,
  Chip,
  Paper,
  Stack,
  CircularProgress,
  Divider,
  Tooltip,
  useTheme,
} from '@mui/material';
import {
  ChevronLeft,
  Star,
  Archive,
  Trash2,
  MoreVertical,
  Reply,
  ReplyAll,
  Forward,
  Mail,
  Edit,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useLabelStore } from '@/stores/label-store';
import { emailApi } from '@/lib/api/email';
import { logger } from '@/lib/logger';
import { EmailSummaryPanel } from '../ai/EmailSummaryPanel';
import { scrollContainerSx } from '../shared/utils';
import { LabelSelector } from '@/components/labels';
import type { Email } from '@/stores/email-store';
import { emailKeys, useEmailThread } from '@/hooks/queries';
import ThreadMessage from './ThreadMessage';

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
  onEditDraft?: (email: Email) => void;
}

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
  const queryClient = useQueryClient();
  const { addEmailsToLabel, removeEmailFromLabel } = useLabelStore();

  const [expandedEmails, setExpandedEmails] = useState<Set<string>>(new Set());
  const [restoredEmail, setRestoredEmail] = useState<Email | null>(null);

  const threadId = email?.threadId ?? email?.id ?? '';
  const threadQuery = useEmailThread(threadId);

  const threadEmails = useMemo(() => {
    if (!email) return [];

    const merged = new Map<string, Email>();
    const apiThread = threadId ? (threadQuery.data ?? []) : [];

    for (const e of apiThread) merged.set(e.id, e as unknown as Email);
    merged.set(email.id, email);
    if (restoredEmail) merged.set(restoredEmail.id, restoredEmail);

    const items = Array.from(merged.values());
    if (items.length === 0) return [email];

    // Sort by most recent first (descending order)
    return items.sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime());
  }, [email, restoredEmail, threadId, threadQuery.data]);

  const isThreadConversation = threadEmails.length > 1;
  const unreadCount = threadEmails.filter((e) => !e.isRead).length;

  useEffect(() => {
    if (threadEmails.length === 0) return;
    let isActive = true;
    const next = new Set<string>();
    next.add(threadEmails[threadEmails.length - 1].id);
    threadEmails.forEach((e) => {
      if (!e.isRead) next.add(e.id);
    });

    // Avoid sync setState in effect (eslint react-hooks/set-state-in-effect)
    queueMicrotask(() => {
      if (isActive) setExpandedEmails(next);
    });

    return () => {
      isActive = false;
    };
  }, [threadEmails]);

  const toggleEmail = useCallback((emailId: string) => {
    setExpandedEmails((prev) => {
      const next = new Set(prev);
      if (next.has(emailId)) next.delete(emailId);
      else next.add(emailId);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    setExpandedEmails(new Set(threadEmails.map((e) => e.id)));
  }, [threadEmails]);

  const collapseAll = useCallback(() => {
    if (threadEmails.length === 0) return;
    setExpandedEmails(new Set([threadEmails[threadEmails.length - 1].id]));
  }, [threadEmails]);

  const collapseRead = useCallback(() => {
    if (threadEmails.length === 0) return;
    const next = new Set<string>();
    next.add(threadEmails[threadEmails.length - 1].id);
    threadEmails.forEach((e) => {
      if (!e.isRead) next.add(e.id);
    });
    setExpandedEmails(next);
  }, [threadEmails]);

  const handleAttachmentOpen = useCallback(
    async (attachment: NonNullable<Email['attachments']>[number], e: React.MouseEvent) => {
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
          return;
        }

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
      } catch (error) {
        logger.error('Failed to open attachment:', { error });
      }
    },
    [],
  );

  const handleInviteRespond = useCallback(
    async (emailId: string, response: 'accept' | 'decline' | 'tentative') => {
      try {
        await emailApi.respondToCalendarInvite(emailId, response);

        const status =
          response === 'accept' ? 'accepted' : response === 'decline' ? 'declined' : 'tentative';

        queryClient.setQueryData<Email>(emailKeys.detail(emailId), (old) =>
          old ? ({ ...old, calendarInviteStatus: status } as Email) : old,
        );

        if (threadId) {
          queryClient.setQueryData<Email[]>(emailKeys.thread(threadId), (old) =>
            old ? old.map((e) => (e.id === emailId ? ({ ...e, calendarInviteStatus: status } as Email) : e)) : old,
          );
        }
      } catch (err) {
        logger.error('Failed to respond to calendar invite', { error: err });
        // Refetch the server state to ensure consistency
        queryClient.invalidateQueries({ queryKey: emailKeys.detail(emailId) });
        if (threadId) queryClient.invalidateQueries({ queryKey: emailKeys.thread(threadId) });
      }
    },
    [queryClient, threadId],
  );

  const handleLabelsChange = useCallback(
    async (labelIds: string[]) => {
      if (!email) return;
      const currentLabels = email.emailLabels?.map((el) => el.label.id) || [];
      const added = labelIds.filter((id) => !currentLabels.includes(id));
      const removed = currentLabels.filter((id) => !labelIds.includes(id));

      try {
        let updatedEmail: Email = email;

        for (const labelId of added) {
          const result = await addEmailsToLabel(labelId, [email.id]);
          if (result.emails && result.emails.length > 0) updatedEmail = result.emails[0] as unknown as Email;
        }

        for (const labelId of removed) {
          const result = await removeEmailFromLabel(labelId, email.id);
          if (result.email) updatedEmail = result.email as unknown as Email;
        }

        onLabelsChange?.(email.id, labelIds, updatedEmail);

        queryClient.setQueryData(emailKeys.detail(updatedEmail.id), updatedEmail);
        if (threadId) {
          queryClient.setQueryData<Email[]>(emailKeys.thread(threadId), (old) =>
            old ? old.map((e) => (e.id === updatedEmail.id ? updatedEmail : e)) : old,
          );
        }

        setRestoredEmail((prev) => (prev?.id === updatedEmail.id ? updatedEmail : prev));
      } catch (error) {
        logger.error('Failed to update labels:', { error });
      }
    },
    [addEmailsToLabel, email, onLabelsChange, queryClient, removeEmailFromLabel, threadId],
  );

  const handleFetchArchived = useCallback(async () => {
    if (!email) return;
    try {
      const res = await emailApi.fetchArchivedEmail(email.id);
      const fetched = res.data as unknown as Email;
      setRestoredEmail(fetched);
      queryClient.setQueryData(emailKeys.detail(fetched.id), fetched);
      if (threadId) {
        queryClient.setQueryData<Email[]>(emailKeys.thread(threadId), (old) =>
          old ? old.map((e) => (e.id === fetched.id ? fetched : e)) : old,
        );
      }
    } catch (error) {
      logger.error('Failed to fetch archived content', { error });
    }
  }, [email, queryClient, threadId]);

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', minHeight: 400 }}>
        <CircularProgress />
      </Box>
    );
  }

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
          {t.email.view.selectEmail}
        </Typography>
      </Box>
    );
  }

  const attachmentTooltip = t.email.view.attachmentsTooltip;

  const isDraft = email.folder === 'DRAFTS' || email.isDraft || email.externalId?.startsWith('draft-');
  const hasBody = Boolean(email.bodyHtml || email.bodyText);

  return (
    <Box
      data-testid="thread-display"
      sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0, minWidth: 0 }}
    >
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
          <IconButton size="small" onClick={onClose} sx={{ mr: 0.5 }} aria-label={t.common.close}>
            <ChevronLeft size={20} />
          </IconButton>
        )}

        <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

        {isDraft && onEditDraft && (
          <Tooltip title={t.common.edit}>
            <Button
              size="small"
              variant="contained"
              color="primary"
              startIcon={<Edit size={16} />}
              onClick={() => onEditDraft(email)}
              sx={{ mr: 1 }}
            >
              {t.common.edit}
            </Button>
          </Tooltip>
        )}

        {!isDraft && (
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
            <Star
              size={18}
              fill={email.isStarred ? '#FFB300' : 'none'}
              color={email.isStarred ? '#FFB300' : 'currentColor'}
            />
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

      <Box sx={{ flex: 1, overflow: 'auto', minHeight: 0, minWidth: 0, ...scrollContainerSx }}>
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
            {email.subject || t.common.noSubject}
          </Typography>

          <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" sx={{ mb: 2 }}>
            {isThreadConversation && (
              <>
                <Chip
                  icon={<Mail size={14} />}
                  label={`${threadEmails.length} ${
                    threadEmails.length === 1 ? t.email.view.message : t.email.view.messages
                  }`}
                  size="small"
                  sx={{ fontWeight: 500 }}
                />
                {unreadCount > 0 && (
                  <Chip
                    label={`${unreadCount} ${
                      unreadCount === 1 ? t.email.view.unreadSingle : t.email.view.unreadPlural
                    }`}
                    size="small"
                    color="primary"
                    sx={{ fontWeight: 600 }}
                  />
                )}
                <Divider orientation="vertical" flexItem sx={{ mx: 0.5, height: 20, alignSelf: 'center' }} />
                <Button size="small" variant="text" onClick={expandAll} sx={{ minWidth: 'auto', px: 1, fontSize: '0.75rem' }}>
                  {t.email.view.expandAll}
                </Button>
                <Button size="small" variant="text" onClick={collapseRead} sx={{ minWidth: 'auto', px: 1, fontSize: '0.75rem' }}>
                  {t.email.view.collapseRead}
                </Button>
                <Button size="small" variant="text" onClick={collapseAll} sx={{ minWidth: 'auto', px: 1, fontSize: '0.75rem' }}>
                  {t.email.view.collapseAll}
                </Button>
              </>
            )}
          </Stack>

          {onLabelsChange && (
            <Box sx={{ mb: 2 }}>
              <LabelSelector
                selectedLabelIds={email.emailLabels?.map((el) => el.label.id) || []}
                selectedLabels={email.emailLabels?.map((el) => el.label) || []}
                onLabelsChange={handleLabelsChange}
                variant="chips"
              />
            </Box>
          )}

          <Box sx={{ mb: 2 }}>
            <EmailSummaryPanel emailId={email.id} defaultExpanded={false} showExtractedItems={true} />
          </Box>

          {!hasBody && (
            <Button variant="outlined" size="small" onClick={handleFetchArchived} sx={{ mb: 2 }}>
              {t.email.view.fetchArchived}
            </Button>
          )}
        </Box>

        <Box sx={{ px: { xs: 2, sm: 3 }, pb: 3 }}>
          {threadId && threadQuery.isFetching && !threadQuery.data && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
              <CircularProgress size={20} />
            </Box>
          )}

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
              onArchive={onArchive ? (e) => onArchive(e.id) : undefined}
              onDelete={onDelete ? (e) => onDelete(e.id) : undefined}
              onToggleStar={onToggleStar ? (e) => onToggleStar(e.id, e.isStarred || false) : undefined}
              onAttachmentOpen={handleAttachmentOpen}
              attachmentTooltip={attachmentTooltip}
              isDark={isDark}
              onInviteRespond={handleInviteRespond}
              t={t}
            />
          ))}
        </Box>
      </Box>
    </Box>
  );
};

export default ThreadDisplay;
