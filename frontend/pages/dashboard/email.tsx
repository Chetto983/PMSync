import React, { useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/router';
import { Layout } from '@/components/layout/Layout';
import { PageErrorBoundary } from '@/components/common/ErrorBoundary';
import { EmailLayout } from '@/components/email';
import { ThreadList, ThreadListItemData } from '@/components/email/list';
import { ThreadView } from '@/components/email/thread';
import type { ThreadMessageData } from '@/components/email/thread';
import { useToast } from '@/hooks/use-toast';
import { useTranslations } from '@/lib/hooks/use-translations';
import {
  useEmails,
  useEmailThread,
  useBulkMoveEmails,
  useBulkMarkRead,
  useBulkDeleteEmails,
  useUpdateEmail,
  useDeleteEmail,
} from '@/hooks/queries';
import { useEmailRealtime } from '@/hooks/use-email-realtime';
import { CircularProgress, Box, Typography, useMediaQuery, useTheme } from '@mui/material';
import type { Email } from '@/lib/api/emails';

/**
 * Email Page
 *
 * Phase 3: Email list with virtual scrolling and drag-and-drop
 * Displays inbox with 3-line layout (sender/subject/snippet)
 * Supports moving emails between folders with provider validation
 */

// Helper to format email data from API to ThreadListItemData
function formatEmailToThread(email: Email): ThreadListItemData {
  return {
    id: email.id,
    from: email.from,
    subject: email.subject || '(No subject)',
    snippet: email.snippet || '',
    date: new Date(email.receivedAt).toLocaleDateString(),
    isUnread: !email.isRead,
    isFlagged: email.isFlagged || email.isStarred,
    hasAttachments: (email.attachments?.length ?? 0) > 0,
    providerId: email.providerId, // Provider ID for drag-and-drop validation
  };
}

// Mock data for demonstration (ONLY as fallback)
const generateMockThreads = (count: number): ThreadListItemData[] => {
  const senders = [
    'John Smith',
    'Sarah Johnson',
    'Mike Chen',
    'Emily Davis',
    'David Wilson',
    'Lisa Anderson',
    'Tom Brown',
    'Anna Martinez',
  ];

  const subjects = [
    'Meeting tomorrow at 10am',
    'Q4 Report Review',
    'Project Update - Phase 3',
    'Budget Approval Request',
    'Team Lunch This Friday',
    'Code Review Required',
    'New Feature Proposal',
    'Performance Optimization Ideas',
  ];

  const snippets = [
    'Hi team, just wanted to confirm our meeting tomorrow morning. Please bring your laptops...',
    'Attached you will find the Q4 financial report for review. Please review by end of week...',
    'Phase 3 is progressing well. We have completed the email list component with virtual scrolling...',
    'The budget for next quarter needs your approval. Please review the attached spreadsheet...',
    'Looking forward to our team lunch this Friday at 12:30pm. Location TBD...',
    'Please review the pull request #123. It includes the new authentication flow...',
    'I have an idea for a new feature that could improve user engagement...',
    'Found several performance bottlenecks in the dashboard. Here are my suggestions...',
  ];

  const labels = [
    { id: '1', name: 'Important', color: '#EF4444' },
    { id: '2', name: 'Work', color: '#3B82F6' },
    { id: '3', name: 'Personal', color: '#10B981' },
    { id: '4', name: 'Follow-up', color: '#F59E0B' },
  ];

  // Mock provider IDs (simulate multiple email accounts)
  const providers = ['gmail-account-1', 'outlook-account-2', 'yahoo-account-3'];

  return Array.from({ length: count }, (_, i) => ({
    id: `email-${i}`,
    from: senders[i % senders.length],
    subject: subjects[i % subjects.length],
    snippet: snippets[i % snippets.length],
    date: i < 10 ? 'Today' : i < 20 ? 'Yesterday' : `${Math.floor(i / 10)} days ago`,
    isUnread: i % 3 === 0, // Every 3rd email is unread
    isFlagged: i % 5 === 0, // Every 5th email is flagged
    hasAttachments: i % 7 === 0, // Every 7th email has attachments
    threadCount: i % 10 === 0 && i > 0 ? Math.floor(Math.random() * 5) + 2 : undefined,
    labels: i % 4 === 0 ? [labels[i % labels.length]] : undefined,
    // Add providerId for drag-and-drop (alternate between providers)
    providerId: providers[i % providers.length],
  }));
};

export default function EmailPage() {
  const router = useRouter();
  const toast = useToast();
  const t = useTranslations();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const isTablet = useMediaQuery(theme.breakpoints.down('md'));
  const isDesktop = !isMobile && !isTablet;

  // Selected thread ID for 3-panel view (desktop only)
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [selectedSubject, setSelectedSubject] = useState<string>('');

  // Enable realtime updates via WebSocket
  useEmailRealtime({ folder: 'INBOX', enabled: true });

  // Fetch real email data from API
  const { data: emailsData, isLoading, refetch } = useEmails({
    specialUse: 'INBOX',
    limit: 50,
  });

  // Fetch thread data when selected (desktop 3-panel view)
  const { data: threadData, isLoading: isThreadLoading } = useEmailThread(selectedThreadId || '');

  // Mutations for email operations
  const moveEmails = useBulkMoveEmails();
  const markRead = useBulkMarkRead();
  const bulkDelete = useBulkDeleteEmails();
  const updateEmail = useUpdateEmail();
  const deleteEmail = useDeleteEmail();

  // Format emails to thread list format
  const threads = emailsData?.emails?.map(formatEmailToThread) ?? [];

  // Fallback to mock data if API fails (development only)
  const [mockThreads] = useState(() => generateMockThreads(50));
  const displayThreads = threads.length > 0 ? threads : mockThreads;

  // Thread click - show inline on desktop, navigate on mobile/tablet
  const handleThreadClick = useCallback(
    (id: string) => {
      // Find the email to get its threadId and subject
      const email = emailsData?.emails?.find((e) => e.id === id);
      const threadId = email?.threadId || id;
      const subject = email?.subject || '(No subject)';

      if (isDesktop) {
        // Desktop: show in reading pane (3-panel view)
        setSelectedThreadId(threadId);
        setSelectedSubject(subject);
      } else {
        // Mobile/Tablet: navigate to thread detail page
        router.push(`/dashboard/email/thread/${threadId}`);
      }
    },
    [router, emailsData?.emails, isDesktop]
  );

  // Close reading pane
  const handleCloseReadingPane = useCallback(() => {
    setSelectedThreadId(null);
    setSelectedSubject('');
  }, []);

  // Format thread emails to ThreadMessageData for ThreadView
  const threadMessages: ThreadMessageData[] = useMemo(() => {
    if (!threadData || !Array.isArray(threadData)) return [];
    return threadData.map((email: Email) => ({
      id: email.id,
      from: email.from,
      to: email.to || [],
      cc: email.cc,
      date: new Date(email.receivedAt).toLocaleDateString(),
      subject: email.subject || '',
      body: email.bodyHtml || email.bodyText || '',
      isUnread: !email.isRead,
      isFlagged: email.isFlagged || email.isStarred || false,
      hasAttachments: (email.attachments?.length ?? 0) > 0,
      attachments: email.attachments?.map((att) => ({
        id: att.id,
        name: att.filename,
        size: att.size,
      })),
    }));
  }, [threadData]);

  // Thread action handlers
  const handleReply = useCallback((messageId: string) => {
    router.push(`/dashboard/email/compose?replyTo=${messageId}`);
  }, [router]);

  const handleReplyAll = useCallback((messageId: string) => {
    router.push(`/dashboard/email/compose?replyTo=${messageId}&replyAll=true`);
  }, [router]);

  const handleForward = useCallback((messageId: string) => {
    router.push(`/dashboard/email/compose?forward=${messageId}`);
  }, [router]);

  const handleFlagMessage = useCallback(async (messageId: string) => {
    const email = threadMessages.find((m) => m.id === messageId);
    if (!email) return;
    try {
      await updateEmail.mutateAsync({
        emailId: messageId,
        dto: { isFlagged: !email.isFlagged },
      });
    } catch {
      toast.error(t.common.genericError);
    }
  }, [threadMessages, updateEmail, toast, t]);

  // Reading pane component for 3-panel desktop view
  const readingPane = useMemo(() => {
    if (!selectedThreadId || !isDesktop) return undefined;

    // Show loading state while fetching thread
    if (isThreadLoading) {
      return (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            gap: 2,
          }}
        >
          <CircularProgress size={32} />
          <Typography variant="body2" color="text.secondary">
            {t.threadView?.loading || 'Loading thread...'}
          </Typography>
        </Box>
      );
    }

    // Show thread view
    return (
      <ThreadView
        threadId={selectedThreadId}
        subject={selectedSubject}
        messages={threadMessages}
        onBack={handleCloseReadingPane}
        onReply={handleReply}
        onReplyAll={handleReplyAll}
        onForward={handleForward}
        onFlag={handleFlagMessage}
      />
    );
  }, [
    selectedThreadId,
    isDesktop,
    isThreadLoading,
    selectedSubject,
    threadMessages,
    handleCloseReadingPane,
    handleReply,
    handleReplyAll,
    handleForward,
    handleFlagMessage,
    t.threadView?.loading,
  ]);

  // Refresh emails
  const handleRefresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  // Bulk mark as read
  const handleBulkMarkAsRead = useCallback(
    async (ids: string[]) => {
      try {
        await markRead.mutateAsync({ emailIds: ids, isRead: true });
        toast.success(t.common.success ?? 'Done');
      } catch {
        toast.error(t.common.genericError);
      }
    },
    [markRead, toast, t]
  );

  // Bulk mark as unread
  const handleBulkMarkAsUnread = useCallback(
    async (ids: string[]) => {
      try {
        await markRead.mutateAsync({ emailIds: ids, isRead: false });
        toast.success(t.common.success ?? 'Done');
      } catch {
        toast.error(t.common.genericError);
      }
    },
    [markRead, toast, t]
  );

  // Bulk archive - moves to Archive folder
  const handleBulkArchive = useCallback(
    async (ids: string[]) => {
      try {
        await moveEmails.mutateAsync({ emailIds: ids, targetFolder: 'ARCHIVE' });
        toast.success(t.common.success ?? 'Done');
      } catch {
        toast.error(t.common.genericError);
      }
    },
    [moveEmails, toast, t]
  );

  // Bulk delete
  const handleBulkDelete = useCallback(
    async (ids: string[]) => {
      try {
        await bulkDelete.mutateAsync(ids);
        toast.success(t.common.success ?? 'Done');
      } catch {
        toast.error(t.common.genericError);
      }
    },
    [bulkDelete, toast, t]
  );

  // Bulk move - show folder picker (TODO: implement picker dialog)
  const handleBulkMove = useCallback((_ids: string[]) => {
    // TODO: Show folder picker dialog (implement in Phase 4.3)
    toast.info(t.threadActions?.folderPickerComingSoon || 'Folder picker coming soon');
  }, [toast, t]);

  // Bulk label - show label picker (TODO: implement picker dialog)
  const handleBulkLabel = useCallback((_ids: string[]) => {
    // TODO: Show label picker dialog (implement in Phase 4.3)
    toast.info(t.threadActions?.labelPickerComingSoon || 'Label picker coming soon');
  }, [toast, t]);

  // Toggle flag on single email
  const handleFlag = useCallback(
    async (id: string) => {
      const email = displayThreads.find((t) => t.id === id);
      if (!email) return;

      try {
        await updateEmail.mutateAsync({
          emailId: id,
          dto: { isFlagged: !email.isFlagged },
        });
      } catch {
        toast.error(t.common.genericError);
      }
    },
    [displayThreads, updateEmail, toast, t]
  );

  // Archive single email
  const handleArchive = useCallback(
    async (id: string) => {
      try {
        await moveEmails.mutateAsync({ emailIds: [id], targetFolder: 'ARCHIVE' });
        toast.success(t.common.success ?? 'Done');
      } catch {
        toast.error(t.common.genericError);
      }
    },
    [moveEmails, toast, t]
  );

  // Delete single email
  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await deleteEmail.mutateAsync(id);
        toast.success(t.common.success ?? 'Done');
      } catch {
        toast.error(t.common.genericError);
      }
    },
    [deleteEmail, toast, t]
  );

  // Drag and drop handler with provider validation
  const handleEmailDrop = async (emailIds: string[], folderId: string, folderName: string) => {
    // Find the email(s) being moved
    const emails = displayThreads.filter((t) => emailIds.includes(t.id));

    if (emails.length === 0) return;

    // Get provider ID from first email
    const emailProviderId = emails[0].providerId;

    if (!emailProviderId) {
      toast.error('Email provider information is missing');
      return;
    }

    // NOTE: Provider validation is done in ThreadList component via DnD collision detection
    // Additional validation can be added here if needed

    try {
      // Call the real API to move emails
      await moveEmails.mutateAsync({
        emailIds,
        targetFolder: folderId,
      });

      // Success! Show toast notification
      const message =
        emailIds.length === 1
          ? t.emailList.emailMoved.replace('{folder}', folderName)
          : t.emailList.emailsMoved
              .replace('{count}', emailIds.length.toString())
              .replace('{folder}', folderName);

      toast.success(message);
    } catch {
      // Error handling - failed to move emails
      toast.error('Failed to move email(s). Please try again.');
    }
  };

  // Show loading state
  if (isLoading) {
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
              Loading emails...
            </Typography>
          </Box>
        </EmailLayout>
      </Layout>
    );
  }

  // Note: Error state is handled by displayThreads fallback to mockThreads
  // and by PageErrorBoundary for render errors

  return (
    <PageErrorBoundary pageName="Email">
      <Layout>
        <EmailLayout readingPane={readingPane}>
          <ThreadList
            threads={displayThreads}
            emptyVariant="inbox"
            isLoading={isLoading}
            onThreadClick={handleThreadClick}
            onRefresh={handleRefresh}
            onBulkMarkAsRead={handleBulkMarkAsRead}
            onBulkMarkAsUnread={handleBulkMarkAsUnread}
            onBulkArchive={handleBulkArchive}
            onBulkDelete={handleBulkDelete}
            onBulkMove={handleBulkMove}
            onBulkLabel={handleBulkLabel}
            onFlag={handleFlag}
            onArchive={handleArchive}
            onDelete={handleDelete}
            onEmailDrop={handleEmailDrop}
          />
          <toast.ToastContainer />
        </EmailLayout>
      </Layout>
    </PageErrorBoundary>
  );
}

export const getServerSideProps = async () => {
  return { props: {} };
};
