import React, { useState } from 'react';
import { Layout } from '@/components/layout/Layout';
import { EmailLayout } from '@/components/email';
import { ThreadList, ThreadListItemData } from '@/components/email/list';

/**
 * Email Page
 *
 * Phase 3: Email list with virtual scrolling
 * Displays inbox with 3-line layout (sender/subject/snippet)
 */

// Mock data for demonstration
// TODO: Replace with real API data from TanStack Query hooks
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

  return Array.from({ length: count }, (_, i) => ({
    id: `email-${i}`,
    from: senders[i % senders.length],
    subject: subjects[i % subjects.length],
    snippet: snippets[i % snippets.length],
    date: i < 10 ? 'Today' : i < 20 ? 'Yesterday' : `${Math.floor(i / 10)} days ago`,
    isUnread: i % 3 === 0, // Every 3rd email is unread
    isStarred: i % 5 === 0, // Every 5th email is starred
    hasAttachments: i % 7 === 0, // Every 7th email has attachments
    threadCount: i % 10 === 0 && i > 0 ? Math.floor(Math.random() * 5) + 2 : undefined,
    labels: i % 4 === 0 ? [labels[i % labels.length]] : undefined,
  }));
};

export default function EmailPage() {
  const [mockThreads] = useState(() => generateMockThreads(50)); // 50 mock emails

  // Mock handlers - TODO: Replace with real API calls
  const handleThreadClick = (_id: string) => {
    // TODO: Navigate to thread detail view
  };

  const handleRefresh = async () => {
    // TODO: Call TanStack Query refetch
    await new Promise((resolve) => setTimeout(resolve, 500));
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

  const handleStar = (_id: string) => {
    // TODO: Call API to toggle star
  };

  const handleArchive = (_id: string) => {
    // TODO: Call API to archive single email
  };

  const handleDelete = (_id: string) => {
    // TODO: Call API to delete single email
  };

  return (
    <Layout>
      <EmailLayout>
        <ThreadList
          threads={mockThreads}
          emptyVariant="inbox"
          onThreadClick={handleThreadClick}
          onRefresh={handleRefresh}
          onBulkMarkAsRead={handleBulkMarkAsRead}
          onBulkMarkAsUnread={handleBulkMarkAsUnread}
          onBulkArchive={handleBulkArchive}
          onBulkDelete={handleBulkDelete}
          onBulkMove={handleBulkMove}
          onBulkLabel={handleBulkLabel}
          onStar={handleStar}
          onArchive={handleArchive}
          onDelete={handleDelete}
        />
      </EmailLayout>
    </Layout>
  );
}

export const getServerSideProps = async () => {
  return { props: {} };
};
