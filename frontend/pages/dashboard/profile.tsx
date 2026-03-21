
import React from 'react';
import { Layout } from '@/components/layout/Layout';
import { ProfileSettings } from '@/components/dashboard/ProfileSettings';
import { PageErrorBoundary } from '@/components/common/ErrorBoundary';
import { PageContainer } from '@/components/common';
import { useTranslations } from '@/lib/hooks/use-translations';
import { authClient } from '@/lib/auth-client';
import { Box, Paper, Skeleton } from '@mui/material';

export default function ProfilePage() {
  const t = useTranslations();
  const { isPending } = authClient.useSession();

  return (
    <Layout>
      <PageErrorBoundary pageName="Profile">
        <PageContainer title={t.settings?.profileTitle ?? t.nav.profile}>
          {isPending ? (
            <Paper sx={{ p: { xs: 2, sm: 3, md: 4 } }}>
              <Skeleton variant="text" width={120} height={32} sx={{ mb: 3 }} />
              <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 2, mb: 3 }}>
                <Box sx={{ flex: 1 }}>
                  <Skeleton variant="text" width={60} height={20} sx={{ mb: 0.5 }} />
                  <Skeleton variant="rounded" height={40} />
                </Box>
                <Box sx={{ flex: 1 }}>
                  <Skeleton variant="text" width={60} height={20} sx={{ mb: 0.5 }} />
                  <Skeleton variant="rounded" height={40} />
                </Box>
              </Box>
              <Skeleton variant="text" width={60} height={20} sx={{ mb: 0.5 }} />
              <Skeleton variant="rounded" height={40} sx={{ mb: 3 }} />
              <Skeleton variant="rounded" width={120} height={36} />
            </Paper>
          ) : (
            <ProfileSettings />
          )}
        </PageContainer>
      </PageErrorBoundary>
    </Layout>
  );
}

export const getServerSideProps = async () => {
  return { props: {} };
};
