import React, { useEffect } from 'react';
import { useRouter } from 'next/router';
import { GetServerSideProps } from 'next';
import Head from 'next/head';
import { Box, Skeleton, Stack } from '@mui/material';
import { Layout } from '@/components/layout/Layout';
import { PageErrorBoundary } from '@/components/common';
import { FollowupsKanbanBoard } from '@/components/productivity/KanbanBoard';
import { authClient } from '@/lib/auth-client';
import { useTranslations } from '@/lib/hooks/use-translations';

export default function FollowUpsPage() {
  const { data: session, isPending: isLoading } = authClient.useSession();
  const isAuthenticated = !!session;
  const t = useTranslations();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/auth/login');
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading || !isAuthenticated) {
    return (
      <Layout>
        <Box sx={{ p: 3 }}>
          <Stack spacing={1.5}>
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} variant="rounded" height={120} animation="wave" />
            ))}
          </Stack>
        </Box>
      </Layout>
    );
  }

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
