import React from 'react';
import { Layout } from '@/components/layout/Layout';
import { ChatPage } from '@/src/components/chat/ChatPage';
import { PageErrorBoundary } from '@/components/common/ErrorBoundary';

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
