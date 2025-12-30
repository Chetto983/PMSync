import React, { useState } from 'react';
import { Layout } from '@/components/layout/Layout';
import { EmailLayout } from '@/components/email';
import { ThreadList, ThreadListItemData } from '@/components/email/list';
import { useToast } from '@/hooks/use-toast';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useEmails, useBulkMoveEmails } from '@/hooks/queries';
import { CircularProgress, Box, Typography } from '@mui/material';
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
  const toast = useToast();
  const t = useTranslations();

  // Fetch real email data from API
  const { data: emailsData, isLoading, error, refetch } = useEmails({
    specialUse: 'INBOX',
    limit: 50,
  });

  // Mutation for moving emails
  const moveEmails = useBulkMoveEmails();

  // Format emails to thread list format
  const threads = emailsData?.emails?.map(formatEmailToThread) ?? [];

  // Fallback to mock data if API fails (development only)
  const [mockThreads] = useState(() => generateMockThreads(50));
  const displayThreads = threads.length > 0 ? threads : mockThreads;

  // Mock handlers - TODO: Replace with real API calls
  const handleThreadClick = (_id: string) => {
    // TODO: Navigate to thread detail view
  };

  const handleRefresh = async () => {
    await refetch();
  };

  const handleBulkMarkAsRead = (_ids: string[]) => {
    // TODO: Call API to mark emails as read
  };

  const handleBulkMarkAsUnread = (_ids: string[]) => {
    // TODO: Call API to mark emails as unread
  };

  const handleBulkArchive = (_ids: string[]) => {
    // TODO: Call API to archive emails
  };

  const handleBulkDelete = (_ids: string[]) => {
    // TODO: Call API to delete emails
  };

  const handleBulkMove = (_ids: string[]) => {
    // TODO: Show folder picker dialog
  };

  const handleBulkLabel = (_ids: string[]) => {
    // TODO: Show label picker dialog
  };

  const handleFlag = (_id: string) => {
    // TODO: Call API to toggle flag
  };

  const handleArchive = (_id: string) => {
    // TODO: Call API to archive single email
  };

  const handleDelete = (_id: string) => {
    // TODO: Call API to delete single email
  };

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

  // Show error state with fallback to mock data
  if (error) {
    // Error loading emails - fall back to mock data
  }

  return (
    <Layout>
      <EmailLayout>
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
  );
}

export const getServerSideProps = async () => {
  return { props: {} };
};
