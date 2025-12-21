import React from 'react';
import { GetServerSideProps } from 'next';
import Head from 'next/head';
import { Box, Container } from '@mui/material';
import { Layout } from '@/components/layout/Layout';
import { PageErrorBoundary } from '@/components/common';
import { FollowUpTracker } from '@/components/ai/FollowUpTracker';
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
        <Box sx={{ py: 3, px: { xs: 2, md: 3 } }}>
          <Container maxWidth="lg" disableGutters>
            <FollowUpTracker />
          </Container>
        </Box>
      </PageErrorBoundary>
    </Layout>
  );
}

export const getServerSideProps: GetServerSideProps = async () => {
  return { props: {} };
};
