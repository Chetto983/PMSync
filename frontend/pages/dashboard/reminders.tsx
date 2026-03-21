import React from 'react';
import Head from 'next/head';
import { GetServerSideProps } from 'next';
import { Box, Skeleton, Stack } from '@mui/material';
import { Layout } from '@/components/layout/Layout';
import { PageErrorBoundary } from '@/components/common';
import { authClient } from '@/lib/auth-client';
import { useTranslations } from '@/lib/hooks/use-translations';
import { RemindersBoard } from '@/components/reminders/RemindersBoard';

export default function RemindersPage() {
  const { data: session, isPending: isLoading } = authClient.useSession();
  const isAuthenticated = !!session;
  const t = useTranslations();

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
        <title>{t.ai.reminders.title} | PMSync</title>
      </Head>
      <PageErrorBoundary pageName="Reminders">
        <Box sx={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'auto' }}>
          <RemindersBoard />
        </Box>
      </PageErrorBoundary>
    </Layout>
  );
}

export const getServerSideProps: GetServerSideProps = async () => {
  return { props: {} };
};
