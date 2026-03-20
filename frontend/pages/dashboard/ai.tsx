import React from 'react';
import dynamic from 'next/dynamic';
import { Layout } from '@/components/layout/Layout';
import { Box, Skeleton } from '@mui/material';
import { PageErrorBoundary } from '@/components/common/ErrorBoundary';

const ChatPage = dynamic(
  () => import('@/src/components/chat/ChatPage').then(m => ({ default: m.ChatPage })),
  { ssr: false, loading: () => <Box sx={{ flex: 1, p: 3 }}><Skeleton variant="rounded" height="100%" /></Box> },
);

/**
 * AI Assistant Page
 *
 * Full assistant-ui chat interface with responsive layouts:
 * - Desktop: conversation sidebar + thread side-by-side
 * - Mobile: full-screen thread with hamburger for conversation list
 */
export default function AiAssistantPage() {
  return (
    <Layout>
      <PageErrorBoundary pageName="AI Assistant">
        <ChatPage />
      </PageErrorBoundary>
    </Layout>
  );
}

export async function getServerSideProps() {
  return { props: {} };
}
