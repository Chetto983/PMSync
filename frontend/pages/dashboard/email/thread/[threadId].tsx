import React, { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { Layout } from '@/components/layout/Layout';
import { PageErrorBoundary } from '@/components/common/ErrorBoundary';
import { EmailLayout } from '@/components/email';
import { ThreadView } from '@/components/email/thread';
import { FolderPickerDialog } from '@/components/email/folders/FolderPickerDialog';
import { LabelPickerDialog } from '@/components/email/labels/LabelPickerDialog';
import type { ThreadMessageData } from '@/components/email/thread';
import { useToast } from '@/hooks/use-toast';
import { useTranslations } from '@/lib/hooks/use-translations';
import {
  useEmailThread,
  useBulkMoveEmails,
  useBulkMarkRead,
  useBulkMarkImportant,
  useBulkDeleteEmails,
  useUpdateEmail,
} from '@/hooks/queries';
import { useEmailRealtime } from '@/hooks/use-email-realtime';
import { CircularProgress, Box, Typography, Button } from '@mui/material';
import { ArrowLeft } from 'lucide-react';
import type { Email } from '@/lib/api/emails';

/**
 * Thread Detail Page
 *
 * Displays a full email thread/conversation with all messages.
 * Uses ThreadView component with virtual scrolling for performance.
 * Connects to realtime updates via WebSocket.
 */

// Map Email from API to ThreadMessageData for ThreadView component
function mapEmailToThreadMessage(email: Email): ThreadMessageData {
  return {
    id: email.id,
    from: email.from,
    to: email.to || [],
    cc: email.cc,
    date: new Date(email.receivedAt).toLocaleString(),
    subject: email.subject || '(No subject)',
    body: email.bodyHtml || email.bodyText || '',
    isUnread: !email.isRead,
    isFlagged: email.isFlagged || email.isStarred,
    hasAttachments: (email.attachments?.length ?? 0) > 0,
    attachments: email.attachments?.map((att) => ({
      id: att.id,
      name: att.filename,
      size: att.size,
    })),
  };
}

export default function ThreadDetailPage() {
  const router = useRouter();
  const toast = useToast();
  const t = useTranslations();

  // Get threadId from URL - may be string or string[] from Next.js
  const threadId = typeof router.query.threadId === 'string' ? router.query.threadId : '';

  // Enable realtime updates for this thread
  useEmailRealtime({ enabled: !!threadId });

  // Dialog state
  const [folderPickerOpen, setFolderPickerOpen] = useState(false);
  const [labelPickerOpen, setLabelPickerOpen] = useState(false);

  // Fetch thread emails
  const { data: emails, isLoading, error, refetch } = useEmailThread(threadId);

  // Mutations for email operations
  const moveEmails = useBulkMoveEmails();
  const markRead = useBulkMarkRead();
  const bulkFlag = useBulkMarkImportant();
  const bulkDelete = useBulkDeleteEmails();
  const updateEmail = useUpdateEmail();

  // Map emails to ThreadMessageData format
  const messages = useMemo(() => {
    if (!emails?.length) return [];
    return emails.map(mapEmailToThreadMessage);
  }, [emails]);

  // Get thread subject from first email
  const subject = useMemo(() => {
    if (!emails?.length) return '';
    return emails[0].subject || '(No subject)';
  }, [emails]);

  // Get all email IDs for bulk operations
  const emailIds = useMemo(() => {
    return emails?.map((e) => e.id) || [];
  }, [emails]);

  // Navigate back to email list
  const handleBack = useCallback(() => {
    router.push('/dashboard/email');
  }, [router]);

  // Toggle flag on single message
  const handleFlag = useCallback(
    async (messageId: string) => {
      const email = emails?.find((e) => e.id === messageId);
      if (!email) return;

      try {
        await updateEmail.mutateAsync({
          emailId: messageId,
          dto: { isFlagged: !email.isFlagged },
        });
      } catch {
        toast.error(t.common.genericError);
      }
    },
    [emails, updateEmail, toast, t]
  );

  // Reply handler - navigate to compose with reply context
  const handleReply = useCallback(
    (messageId: string) => {
      router.push(`/dashboard/email/compose?replyTo=${messageId}&threadId=${threadId}`);
    },
    [router, threadId]
  );

  // Forward handler - navigate to compose with forward context
  const handleForward = useCallback(
    (messageId: string) => {
      router.push(`/dashboard/email/compose?forward=${messageId}`);
    },
    [router]
  );

  // Reply All handler - navigate to compose with reply all context
  const handleReplyAll = useCallback(
    (messageId: string) => {
      router.push(`/dashboard/email/compose?replyTo=${messageId}&threadId=${threadId}&replyAll=true`);
    },
    [router, threadId]
  );

  // Download attachment handler
  const handleDownloadAttachment = useCallback(
    async (messageId: string, attachmentId: string) => {
      try {
        const { emailsApi } = await import('@/lib/api/emails');
        const blob = await emailsApi.downloadAttachment(messageId, attachmentId);

        // Get attachment metadata for filename
        const email = emails?.find((e) => e.id === messageId);
        const attachment = email?.attachments?.find((a) => a.id === attachmentId);
        const filename = attachment?.filename || 'attachment';

        // Create download link
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } catch {
        toast.error(t.common.genericError);
      }
    },
    [emails, toast, t]
  );

  // Delete entire thread
  const handleDeleteThread = useCallback(async () => {
    if (!emailIds.length) return;

    try {
      await bulkDelete.mutateAsync(emailIds);
      toast.success(t.threadActions?.threadDeleted || 'Thread deleted');
      router.push('/dashboard/email');
    } catch {
      toast.error(t.common.genericError);
    }
  }, [emailIds, bulkDelete, toast, t, router]);

  // Move thread to folder
  const handleMoveThread = useCallback(() => {
    setFolderPickerOpen(true);
  }, []);

  // Archive entire thread
  const handleArchiveThread = useCallback(async () => {
    if (!emailIds.length) return;

    try {
      await moveEmails.mutateAsync({ emailIds, targetFolder: 'ARCHIVE' });
      toast.success(t.threadActions?.threadArchived || 'Thread archived');
      router.push('/dashboard/email');
    } catch {
      toast.error(t.common.genericError);
    }
  }, [emailIds, moveEmails, toast, t, router]);

  // Mark all messages as read
  const handleMarkThreadRead = useCallback(async () => {
    if (!emailIds.length) return;

    try {
      await markRead.mutateAsync({ emailIds, isRead: true });
      toast.success(t.threadActions?.threadMarkedRead || 'Marked as read');
    } catch {
      toast.error(t.common.genericError);
    }
  }, [emailIds, markRead, toast, t]);

  // Mark all messages as unread
  const handleMarkThreadUnread = useCallback(async () => {
    if (!emailIds.length) return;

    try {
      await markRead.mutateAsync({ emailIds, isRead: false });
      toast.success(t.threadActions?.threadMarkedUnread || 'Marked as unread');
    } catch {
      toast.error(t.common.genericError);
    }
  }, [emailIds, markRead, toast, t]);

  // Flag all messages - using bulk API for efficiency
  const handleFlagAllMessages = useCallback(async () => {
    if (!emailIds.length) return;

    try {
      await bulkFlag.mutateAsync({ emailIds, isImportant: true });
      toast.success(t.threadActions?.threadFlagged || 'All messages flagged');
    } catch {
      toast.error(t.common.genericError);
    }
  }, [emailIds, bulkFlag, toast, t]);

  // Unflag all messages - using bulk API for efficiency
  const handleUnflagAllMessages = useCallback(async () => {
    if (!emailIds.length) return;

    try {
      await bulkFlag.mutateAsync({ emailIds, isImportant: false });
      toast.success(t.threadActions?.threadUnflagged || 'All messages unflagged');
    } catch {
      toast.error(t.common.genericError);
    }
  }, [emailIds, bulkFlag, toast, t]);

  // Add labels
  const handleAddLabelsToThread = useCallback(() => {
    setLabelPickerOpen(true);
  }, []);

  // Loading state
  if (isLoading || !router.isReady) {
    return (
      <Layout>
        <EmailLayout>
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 400,
              gap: 2,
            }}
          >
            <CircularProgress size={40} />
            <Typography variant="body2" color="text.secondary">
              {t.threadView?.loading || 'Loading thread...'}
            </Typography>
          </Box>
        </EmailLayout>
      </Layout>
    );
  }

  // Error state
  if (error) {
    return (
      <Layout>
        <EmailLayout>
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 400,
              gap: 2,
            }}
          >
            <Typography color="error">{t.common.genericError}</Typography>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <Button variant="outlined" startIcon={<ArrowLeft />} onClick={handleBack}>
                {t.email?.view?.back || 'Back'}
              </Button>
              <Button variant="contained" onClick={() => refetch()}>
                {t.common.retry || 'Retry'}
              </Button>
            </Box>
          </Box>
        </EmailLayout>
      </Layout>
    );
  }

  // Empty thread (shouldn't happen normally)
  if (!messages.length) {
    return (
      <Layout>
        <EmailLayout>
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 400,
              gap: 2,
            }}
          >
            <Typography color="text.secondary">No messages in this thread</Typography>
            <Button variant="outlined" startIcon={<ArrowLeft />} onClick={handleBack}>
              {t.email?.view?.back || 'Back'}
            </Button>
          </Box>
        </EmailLayout>
      </Layout>
    );
  }

  return (
    <PageErrorBoundary pageName="Thread">
      <Layout>
        <EmailLayout>
          <ThreadView
            threadId={threadId}
            subject={subject}
            messages={messages}
            onBack={handleBack}
            onFlag={handleFlag}
            onReply={handleReply}
            onReplyAll={handleReplyAll}
            onForward={handleForward}
            onDownloadAttachment={handleDownloadAttachment}
            onDeleteThread={handleDeleteThread}
            onMoveThread={handleMoveThread}
            onArchiveThread={handleArchiveThread}
            onMarkThreadRead={handleMarkThreadRead}
            onMarkThreadUnread={handleMarkThreadUnread}
            onFlagAllMessages={handleFlagAllMessages}
            onUnflagAllMessages={handleUnflagAllMessages}
            onAddLabelsToThread={handleAddLabelsToThread}
          />
          <toast.ToastContainer />

          <FolderPickerDialog
            open={folderPickerOpen}
            onClose={() => setFolderPickerOpen(false)}
            emailIds={emailIds}
            onSuccess={() => {
              // Optional: redirect to list if moved out of current context (e.g. Inbox)
              // For now, we stay on thread but maybe show success toast (handled in dialog)
            }}
          />

          <LabelPickerDialog
            open={labelPickerOpen}
            onClose={() => setLabelPickerOpen(false)}
            emailIds={emailIds}
          />
        </EmailLayout>
      </Layout>
    </PageErrorBoundary>
  );
}

export const getServerSideProps = async () => {
  return { props: {} };
};
