import React from 'react';
import { Layout } from '@/components/layout/Layout';
import { AiDashboard } from '@/components/ai/AiDashboard';
import { PageErrorBoundary } from '@/components/common/ErrorBoundary';

/**
 * AI Assistant Page - Modern 2025 Design
 *
 * Clean, widget-based AI assistant interface with:
 * - Chat interface with quick actions
 * - Pending actions sidebar widget
 * - Learning progress widget
 * - Follows main dashboard patterns
 */
export default function AiAssistantPage() {
  return (
    <Layout>
      <PageErrorBoundary pageName="AI Assistant">
        <AiDashboard />
      </PageErrorBoundary>
    </Layout>
  );
}

export async function getServerSideProps() {
  return { props: {} };
}
