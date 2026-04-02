import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { Layout } from '@/components/layout/Layout';
import { PageErrorBoundary } from '@/components/common/ErrorBoundary';
import { EntityContextSidebar } from '@/components/common/EntityContextSidebar';
import { ThreadView } from '@/components/email/thread';
import { FolderPickerDialog } from '@/components/email/folders/FolderPickerDialog';
import { LabelPickerDialog } from '@/components/email/labels/LabelPickerDialog';
import { useTranslations } from '@/lib/hooks/use-translations';
import {
  useEmailThread,
  useBulkMoveEmails,
  useBulkMarkRead,
  useBulkMarkImportant,
  useBulkDeleteEmails,
  useUpdateEmail,
  useRemoveEmailFromLabel,
  useCreateLabel,
  useAddEmailsToLabel,
  labelsListOptions,
} from '@/hooks/queries';
import { useQueryClient } from '@tanstack/react-query';
import { useEmailRealtime } from '@/hooks/use-email-realtime';
import { CircularProgress, Box, Typography, Button, useMediaQuery, useTheme } from '@mui/material';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ArrowLeft } from 'lucide-react';
import { useGlobalToast } from '@/lib/context/toast-context';
import { useUserTimezone } from '@/hooks/use-user-timezone';
import { extractEmailAddress, extractSenderDisplayName, mapEmailToThreadMessage } from '@/components/email/utils/email-formatters';



export default function ThreadDetailPage() {
  const router = useRouter();
  const toast = useGlobalToast();
  const t = useTranslations();
  const tz = useUserTimezone();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const threadId = typeof router.query.threadId === 'string' ? router.query.threadId : '';
  useEmailRealtime({ enabled: !!threadId });

  const [folderPickerOpen, setFolderPickerOpen] = useState(false);
  const [labelPickerOpen, setLabelPickerOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);

  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === 'undefined') return !isMobile;
    const stored = localStorage.getItem('pmsync:crm-sidebar-open');
    return stored !== null ? stored === 'true' : !isMobile;
  });
  const { data: emails, isLoading, error, refetch } = useEmailThread(threadId);
  const moveEmails = useBulkMoveEmails();
  const markRead = useBulkMarkRead();
  const bulkFlag = useBulkMarkImportant();
  const bulkDelete = useBulkDeleteEmails();
  const updateEmail = useUpdateEmail();
  const removeEmailFromLabel = useRemoveEmailFromLabel();
  const createLabel = useCreateLabel();
  const addEmailsToLabel = useAddEmailsToLabel();
  const queryClient = useQueryClient();

  const messages = useMemo(() => {
    if (!emails?.length) return [];
    return emails.map((e) => mapEmailToThreadMessage(e, tz));
  }, [emails, tz]);

  const subject = useMemo(() => {
    if (!emails?.length) return '';
    return emails[0].subject || '(No subject)';
  }, [emails]);

  const emailIds = useMemo(() => {
    return emails?.map((e) => e.id) || [];
  }, [emails]);

  // Extract sender info from the most recent message for CRM sidebar
  const senderEmail = useMemo(() => {
    if (!emails?.length) return '';
    const lastEmail = emails[emails.length - 1];
    return extractEmailAddress(lastEmail.from);
  }, [emails]);

  const senderName = useMemo(() => {
    if (!emails?.length) return null;
    const lastEmail = emails[emails.length - 1];
    return extractSenderDisplayName(lastEmail.from);
  }, [emails]);

  const handleSidebarToggle = useCallback(() => {
    setSidebarOpen((prev) => {
      const next = !prev;
      localStorage.setItem('pmsync:crm-sidebar-open', String(next));
      return next;
    });
  }, []);

  const hasFlaggedMessages = useMemo(
    () => emails?.some((email) => email.isFlagged || email.isStarred) ?? false,
    [emails]
  );

  const hasUnflaggedMessages = useMemo(
    () => emails?.some((email) => !email.isFlagged && !email.isStarred) ?? false,
    [emails]
  );

  const providerId = useMemo(() => {
    return emails?.[0]?.providerId;
  }, [emails]);

  const handleBack = useCallback(() => {
    router.push('/dashboard/email');
  }, [router]);

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

  const handleReply = useCallback(
    (messageId: string) => {
      router.push(`/dashboard/email/compose?mode=reply&emailId=${messageId}`);
    },
    [router]
  );

  const handleForward = useCallback(
    (messageId: string) => {
      router.push(`/dashboard/email/compose?mode=forward&emailId=${messageId}`);
    },
    [router]
  );

  const handleReplyAll = useCallback(
    (messageId: string) => {
      router.push(`/dashboard/email/compose?mode=replyAll&emailId=${messageId}`);
    },
    [router]
  );

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

  const handleDeleteThread = useCallback(() => {
    if (!emailIds.length) return;
    setDeleteDialogOpen(true);
  }, [emailIds]);

  const handleConfirmDelete = useCallback(async () => {
    if (!emailIds.length) return;

    try {
      await bulkDelete.mutateAsync(emailIds);
      setDeleteDialogOpen(false);
      toast.success(t.threadActions?.threadDeleted || 'Thread deleted');
      router.push('/dashboard/email');
    } catch {
      toast.error(t.common.genericError);
    }
  }, [emailIds, bulkDelete, toast, t, router]);

  const handleMoveThread = useCallback(() => {
    setFolderPickerOpen(true);
  }, []);

  const handleArchiveThread = useCallback(() => {
    if (!emailIds.length) return;
    setArchiveDialogOpen(true);
  }, [emailIds]);

  const handleConfirmArchive = useCallback(async () => {
    if (!emailIds.length) return;

    try {
      await moveEmails.mutateAsync({ emailIds, targetFolder: 'ARCHIVE' });
      setArchiveDialogOpen(false);
      toast.success(t.threadActions?.threadArchived || 'Thread archived');
      router.push('/dashboard/email');
    } catch {
      toast.error(t.common.genericError);
    }
  }, [emailIds, moveEmails, toast, t, router]);

  const handleMarkThreadRead = useCallback(async () => {
    if (!emailIds.length) return;

    try {
      await markRead.mutateAsync({ emailIds, isRead: true });
      toast.success(t.threadActions?.threadMarkedRead || 'Marked as read');
    } catch {
      toast.error(t.common.genericError);
    }
  }, [emailIds, markRead, toast, t]);

  const handleMarkThreadUnread = useCallback(async () => {
    if (!emailIds.length) return;

    try {
      await markRead.mutateAsync({ emailIds, isRead: false });
      toast.success(t.threadActions?.threadMarkedUnread || 'Marked as unread');
    } catch {
      toast.error(t.common.genericError);
    }
  }, [emailIds, markRead, toast, t]);

  const handleFlagAllMessages = useCallback(async () => {
    if (!emailIds.length) return;

    try {
      await bulkFlag.mutateAsync({ emailIds, isImportant: true });
      toast.success(t.threadActions?.threadFlagged || 'All messages flagged');
    } catch {
      toast.error(t.common.genericError);
    }
  }, [emailIds, bulkFlag, toast, t]);

  const handleUnflagAllMessages = useCallback(async () => {
    if (!emailIds.length) return;

    try {
      await bulkFlag.mutateAsync({ emailIds, isImportant: false });
      toast.success(t.threadActions?.threadUnflagged || 'All messages unflagged');
    } catch {
      toast.error(t.common.genericError);
    }
  }, [emailIds, bulkFlag, toast, t]);

  const handleAddLabelsToThread = useCallback(() => {
    setLabelPickerOpen(true);
  }, []);

  const handleRemoveLabel = useCallback(async (_messageId: string, labelId: string) => {
    try {
      await removeEmailFromLabel.mutateAsync({ labelId, emailId: _messageId });
      toast.success(t.email?.labels?.labelRemoved || 'Label removed');
      refetch();
    } catch {
      toast.error(t.email?.labels?.labelRemoveFailed || 'Failed to remove label');
    }
  }, [removeEmailFromLabel, toast, t, refetch]);

  const handleAcceptAiLabel = useCallback(async (messageId: string, labelName: string) => {
    try {
      const existingLabels = queryClient.getQueryData<Array<{ id: string; name: string }>>(labelsListOptions().queryKey);
      let labelId: string;
      const existing = existingLabels?.find((l) => l.name.toLowerCase() === labelName.toLowerCase());
      if (existing) {
        labelId = existing.id;
      } else {
        const created = await createLabel.mutateAsync({ name: labelName });
        labelId = created.label.id;
      }
      await addEmailsToLabel.mutateAsync({ labelId, emailIds: [messageId] });
      // Find email to get current aiLabels and remove the accepted one
      const email = emails?.find((e) => e.id === messageId);
      const updatedAiLabels = (email?.aiLabels || []).filter((l) => l !== labelName);
      await updateEmail.mutateAsync({ emailId: messageId, dto: { aiLabels: updatedAiLabels } });
      toast.success(t.email?.labels?.aiLabelAccepted || 'AI label accepted');
      refetch();
    } catch {
      toast.error(t.common.genericError);
    }
  }, [queryClient, createLabel, addEmailsToLabel, updateEmail, emails, toast, t, refetch]);

  const handleDismissAiLabel = useCallback(async (messageId: string, labelName: string) => {
    try {
      const email = emails?.find((e) => e.id === messageId);
      const updatedAiLabels = (email?.aiLabels || []).filter((l) => l !== labelName);
      await updateEmail.mutateAsync({ emailId: messageId, dto: { aiLabels: updatedAiLabels } });
      toast.success(t.email?.labels?.aiLabelDismissed || 'AI label dismissed');
      refetch();
    } catch {
      toast.error(t.common.genericError);
    }
  }, [updateEmail, emails, toast, t, refetch]);

  if (isLoading || !router.isReady) {
    return (
      <Layout>
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            flex: 1,
            minHeight: 400,
            gap: 2,
          }}
        >
          <CircularProgress size={40} />
          <Typography variant="body2" color="text.secondary">
            {t.threadView?.loading || 'Loading thread...'}
          </Typography>
        </Box>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout>
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            flex: 1,
            minHeight: 400,
            gap: 2,
          }}
        >
          <Typography color="error">
            {(error as { status?: number })?.status === 404
              ? (t.threadView?.threadNotFound || 'Thread not found')
              : (error instanceof Error && error.message?.toLowerCase().includes('network'))
                ? (t.threadView?.connectionError || 'Could not load thread. Check your connection.')
                : t.common.genericError}
          </Typography>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Button variant="outlined" startIcon={<ArrowLeft />} onClick={handleBack}>
              {t.email?.view?.back || 'Back'}
            </Button>
            <Button variant="contained" onClick={() => refetch()}>
              {t.common.retry || 'Retry'}
            </Button>
          </Box>
        </Box>
      </Layout>
    );
  }

  if (!messages.length) {
    return (
      <Layout>
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            flex: 1,
            minHeight: 400,
            gap: 2,
          }}
        >
          <Typography color="text.secondary">{t.threadView?.emptyThread || 'No messages in this thread'}</Typography>
          <Button variant="outlined" startIcon={<ArrowLeft />} onClick={handleBack}>
            {t.email?.view?.back || 'Back'}
          </Button>
        </Box>
      </Layout>
    );
  }

  return (
    <PageErrorBoundary pageName="Thread">
      <Layout>
        <Box sx={{ display: 'flex', flex: 1, height: '100%', minHeight: 0, overflow: 'hidden' }}>
          {/* Thread content area */}
          <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, overflow: 'hidden' }}>
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
              onFlagAllMessages={hasUnflaggedMessages ? handleFlagAllMessages : undefined}
              onUnflagAllMessages={hasFlaggedMessages ? handleUnflagAllMessages : undefined}
              onAddLabelsToThread={handleAddLabelsToThread}
              onRemoveLabel={handleRemoveLabel}
              onAcceptAiLabel={handleAcceptAiLabel}
              onDismissAiLabel={handleDismissAiLabel}
            />
          </Box>

          {/* CRM Context Sidebar */}
          {!isMobile && (
            <EntityContextSidebar
              email={senderEmail}
              contactName={senderName}
              open={sidebarOpen}
              onToggle={handleSidebarToggle}
            />
          )}

          <FolderPickerDialog
            open={folderPickerOpen}
            onClose={() => setFolderPickerOpen(false)}
            emailIds={emailIds}
            providerId={providerId}
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

          <ConfirmDialog
            open={deleteDialogOpen}
            onClose={() => setDeleteDialogOpen(false)}
            onConfirm={handleConfirmDelete}
            variant="danger"
            title={t.threadActions?.deleteThreadConfirm || 'Delete entire conversation?'}
            message={
              (t.threadActions?.deleteThreadDesc || 'All {count} messages in this thread will be permanently deleted.')
                .replace('{count}', String(emailIds.length))
            }
            confirmText={t.common.delete || 'Delete'}
            cancelText={t.common.cancel}
            isLoading={bulkDelete.isPending}
          />

          <ConfirmDialog
            open={archiveDialogOpen}
            onClose={() => setArchiveDialogOpen(false)}
            onConfirm={handleConfirmArchive}
            variant="warning"
            title={t.threadActions?.archiveThreadConfirm || 'Archive entire conversation?'}
            message={
              (t.threadActions?.archiveThreadDesc || 'All {count} messages in this thread will be archived.')
                .replace('{count}', String(emailIds.length))
            }
            confirmText={t.threadActions?.archiveThread || 'Archive'}
            cancelText={t.common.cancel}
            isLoading={moveEmails.isPending}
          />

        </Box>
      </Layout>
    </PageErrorBoundary>
  );
}

export const getServerSideProps = async () => {
  return { props: {} };
};
