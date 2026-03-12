
import React from 'react';
import { Layout } from '@/components/layout/Layout';
import { Box, Typography } from '@mui/material';
import { ProfileSettings } from '@/components/dashboard/ProfileSettings';
import { PageErrorBoundary } from '@/components/common/ErrorBoundary';
import { useTranslations } from '@/lib/hooks/use-translations';

export default function ProfilePage() {
  const t = useTranslations();

  return (
    <Layout>
      <PageErrorBoundary pageName="Profile">
        <Box>
          <Typography variant="h4" sx={{ mb: 4 }}>
            {t.settings?.profileTitle || 'Impostazioni profilo'}
          </Typography>
          <ProfileSettings />
        </Box>
      </PageErrorBoundary>
    </Layout>
  );
}

export const getServerSideProps = async () => {
  return { props: {} };
};
