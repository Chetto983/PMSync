import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Button, CircularProgress, Stack, Typography, useTheme } from '@mui/material';
import { Reply } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import type { Email } from '@/stores/email-store';
import { useTranslations } from '@/lib/hooks/use-translations';
import { ThreadMessage } from './ThreadMessage';
import { LabelSelector } from '../../labels/LabelSelector';
import { EmailSummaryPanel } from '../ai/EmailSummaryPanel';
import { emailApi } from '@/lib/api/email';

interface ThreadDisplayProps {
  email: Email | null;
  onClose?: () => void;
  onReply?: (email: Email) => void;
  onReplyAll?: (email: Email) => void;
  onForward?: (email: Email) => void;
  onDelete?: (email: Email) => void;
  onArchive?: (email: Email) => void;
  onLabelsChange?: (emailId: string, labelIds: string[]) => void;
  onToggleStar?: (emailId: string, isStarred: boolean) => void;
  onEditDraft?: (email: Email) => void;
  threadId?: string;
}

export const ThreadDisplay: React.FC<ThreadDisplayProps> = ({
  email,
  // onClose,
  onReply,
  onReplyAll,
  onForward,
  onDelete,
  // onArchive,
  onLabelsChange,
  // onToggleStar,
  // onEditDraft,
  threadId,
}) => {
  const t = useTranslations();
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  const threadQuery = useQuery({
    queryKey: ['thread', threadId],
    queryFn: async () => {
      if (!threadId) return [];
      const response = await emailApi.getThread(threadId);
      // Correct type: emailApi.getThread returns response with data property
      return response.data;
    },
    enabled: !!threadId,
    staleTime: 1000 * 60 * 5,
  });

  const handleFetchArchived = useCallback(async () => {
    if (email && !email.bodyHtml && !email.bodyText) {
      // console.log('Fetching archived body...');
    }
  }, [email]);

  const threadEmails = useMemo(() => {
    if (!email) return [];

    const merged = new Map<string, Email>();
    // Correct typing: queryFn returns Email[] (via response.data)
    const apiThread = threadId ? (threadQuery.data as unknown as Email[] ?? []) : [];

    for (const e of apiThread) merged.set(e.id, e);
    merged.set(email.id, email);

    const items = Array.from(merged.values());
    if (items.length === 0) return [email];

    // Sort by Newest First (Descending)
    return items.sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime());
  }, [email, threadId, threadQuery.data]);

  const isThreadConversation = threadEmails.length > 1;

  const [expandedEmails, setExpandedEmails] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (threadEmails.length === 0) return;
    let isActive = true;
    const next = new Set<string>();
    if (threadEmails.length > 0) {
      next.add(threadEmails[0].id);
    }
    threadEmails.forEach((e) => {
      if (!e.isRead) next.add(e.id);
    });

    queueMicrotask(() => {
      if (isActive) setExpandedEmails(next);
    });

    return () => { isActive = false; };
  }, [threadEmails]);

  const toggleEmail = useCallback((id: string) => {
    setExpandedEmails((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const expandAll = () => setExpandedEmails(new Set(threadEmails.map(e => e.id)));
  const collapseAll = () => setExpandedEmails(new Set());
  const collapseRead = () => {
    const next = new Set<string>();
    threadEmails.forEach(e => {
      if (!e.isRead) next.add(e.id);
    });
    setExpandedEmails(next);
  };

  const handleAttachmentOpen = useCallback((_attachment: unknown, e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  const handleLabelsChange = useCallback(
    (labelIds: string[]) => {
      if (email && onLabelsChange) {
        onLabelsChange(email.id, labelIds);
      }
    },
    [email, onLabelsChange]
  );

  const handleInviteRespond = useCallback(async (_emailId: string, _response: 'accept' | 'decline' | 'tentative') => {
    // Implementation placeholder
  }, []);

  if (!email) return null;

  const hasBody = !!(email.bodyHtml || email.bodyText);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <Box sx={{ flexShrink: 0 }}>
        {/* Toolbar and Header */}
        <Box sx={{ px: { xs: 2, sm: 3 }, pt: { xs: 2, sm: 3 }, pb: 2 }}>
          <Typography
            variant="h5"
            sx={{
              fontWeight: 700,
              lineHeight: 1.3,
              mb: 1.5,
              fontSize: { xs: '1.25rem', sm: '1.75rem' },
              wordBreak: 'break-word',
              color: 'text.primary',
              letterSpacing: '-0.01em',
            }}
          >
            {email.subject || t.common.noSubject}
          </Typography>

          {/* Cleaned Actions Button Group */}
          <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" sx={{ mb: 1 }}>
            {isThreadConversation && (
              <>
                <Button size="small" variant="text" onClick={expandAll} sx={{ minWidth: 'auto', px: 1, fontSize: '0.75rem', color: 'text.secondary', textTransform: 'none' }}>
                  {t.email.view.expandAll}
                </Button>
                <Button size="small" variant="text" onClick={collapseRead} sx={{ minWidth: 'auto', px: 1, fontSize: '0.75rem', color: 'text.secondary', textTransform: 'none' }}>
                  {t.email.view.collapseRead}
                </Button>
                <Button size="small" variant="text" onClick={collapseAll} sx={{ minWidth: 'auto', px: 1, fontSize: '0.75rem', color: 'text.secondary', textTransform: 'none' }}>
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

          {!hasBody && (!threadId || !threadQuery.data) && (
            <Button variant="outlined" size="small" onClick={handleFetchArchived} sx={{ mb: 2 }}>
              {t.email.view.fetchArchived}
            </Button>
          )}
        </Box>
      </Box>

      {/* Scrollable Content Area */}
      <Box sx={{ px: { xs: 2, sm: 3 }, pb: 3, flex: 1, overflowY: 'auto', minHeight: 0 }}>
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
            onDelete={onDelete ? (e) => onDelete(e) : undefined}
            onAttachmentOpen={handleAttachmentOpen}
            isDark={isDark}
            onInviteRespond={handleInviteRespond}
            t={t}
          />
        ))}
      </Box>

      {/* Sticky Reply Footer */}
      <Box
        sx={{
          p: 2,
          borderTop: '1px solid',
          borderColor: 'divider',
          bgcolor: 'background.paper',
          zIndex: 10,
        }}
      >
        <Button
          fullWidth
          variant="outlined"
          onClick={() => onReply?.(threadEmails[0] || email)}
          sx={{
            justifyContent: 'flex-start',
            color: 'text.secondary',
            borderColor: 'divider',
            borderRadius: 2,
            py: 1.5,
            px: 2,
            textTransform: 'none',
            bgcolor: 'background.paper',
            '&:hover': {
              borderColor: 'action.active',
              bgcolor: 'action.hover',
            },
          }}
          startIcon={<Reply size={18} />}
        >
          {t.email.view.reply}...
        </Button>
      </Box>
    </Box>
  );
};


