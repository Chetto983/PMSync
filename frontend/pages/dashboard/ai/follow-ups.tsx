import React from 'react';
import dynamic from 'next/dynamic';
import { GetServerSideProps } from 'next';
import Head from 'next/head';
import { Box } from '@mui/material';
import { Layout } from '@/components/layout/Layout';
import { PageErrorBoundary } from '@/components/common';
import { KanbanSkeleton } from '@/components/productivity/KanbanBoard/KanbanSkeleton';
import { authClient } from '@/lib/auth-client';
import { useTranslations } from '@/lib/hooks/use-translations';

// Dynamic import with SSR disabled (@dnd-kit uses window/document APIs)
// KanbanBoard contains @dnd-kit/core, @dnd-kit/sortable dependencies
const FollowupsKanbanBoard = dynamic(
  () => import('@/components/productivity/KanbanBoard').then(mod => mod.FollowupsKanbanBoard),
  {
    loading: () => <KanbanSkeleton columns={4} cardsPerColumn={3} />,
    ssr: false,
  }
);

export default function FollowUpsPage() {
  const { data: session, isPending: isLoading } = authClient.useSession();
  const isAuthenticated = !!session;
  const t = useTranslations();

  if (isLoading) {
    return null;
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <Layout>
      <Head>
        <title>{t.ai.followUpTracker.title} | PMSync</title>
      </Head>
      <PageErrorBoundary pageName="Follow-up Tracker">
        <Box sx={{ height: 'calc(100vh - 64px)', overflow: 'hidden' }}>
          <FollowupsKanbanBoard />
        </Box>
      </PageErrorBoundary>
    </Layout>
  );
}

export const getServerSideProps: GetServerSideProps = async () => {
  return { props: {} };
};
