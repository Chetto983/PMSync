import React from 'react';
import { GetServerSideProps } from 'next';
import Head from 'next/head';
import { Box } from '@mui/material';
import { Layout } from '@/components/layout/Layout';
import { PageErrorBoundary } from '@/components/common';
import { FollowupsKanbanBoard } from '@/components/productivity/KanbanBoard';
import { authClient } from '@/lib/auth-client';
import { useTranslations } from '@/lib/hooks/use-translations';

export default function FollowUpsPage() {
  const { data: session, isPending: isLoading } = authClient.useSession();
  const isAuthenticated = !!session;
  const t = useTranslations();

  if (isLoading || !isAuthenticated) return null;

  return (
    <Layout>
      <Head>
        <title>{t.ai.followUpTracker.title} | PMSync</title>
      </Head>
      <PageErrorBoundary pageName="Follow-up Tracker">
        <Box sx={{ flex: 1, overflowY: 'auto' }}>
          <FollowupsKanbanBoard />
        </Box>
      </PageErrorBoundary>
    </Layout>
  );
}

export const getServerSideProps: GetServerSideProps = async () => {
  return { props: {} };
};
