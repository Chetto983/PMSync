
import React from 'react';
import { Layout } from '@/components/layout/Layout';
import { Box, Typography } from '@mui/material';
import { AnalyticsChart } from '@/components/dashboard/AnalyticsChart';
import { PageErrorBoundary } from '@/components/common/ErrorBoundary';
import { useTranslations } from '@/lib/hooks/use-translations';

export default function AnalyticsPage() {
  const t = useTranslations();

  return (
    <Layout>
      <PageErrorBoundary pageName="Analytics">
        <Box sx={{ p: { xs: 2, sm: 3 } }}>
          <Typography variant="h4" sx={{ mb: 3 }}>
            {t.nav.analytics}
          </Typography>
          <AnalyticsChart />
        </Box>
      </PageErrorBoundary>
    </Layout>
  );
}

export const getServerSideProps = async () => {
  return { props: {} };
};
