import React from 'react';
import { GetServerSideProps } from 'next';
import Head from 'next/head';
import { Box } from '@mui/material';
import { Layout } from '@/components/layout/Layout';
import { PageErrorBoundary } from '@/components/common';
import { FollowupsKanbanBoard } from '@/components/productivity/KanbanBoard';
import { useAuth } from '@/lib/hooks/use-auth';
import { useTranslations } from '@/lib/hooks/use-translations';

export default function FollowUpsPage() {
  const { isAuthenticated, isLoading } = useAuth();
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
