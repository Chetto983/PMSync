
import React from 'react';
import dynamic from 'next/dynamic';
import { Layout } from '@/components/layout/Layout';
import { Box, Typography, Skeleton } from '@mui/material';
import { PageErrorBoundary } from '@/components/common/ErrorBoundary';
import { useTranslations } from '@/lib/hooks/use-translations';

const AnalyticsChart = dynamic(
  () => import('@/components/dashboard/AnalyticsChart').then(m => ({ default: m.AnalyticsChart })),
  { ssr: false, loading: () => <Skeleton variant="rounded" height={400} /> },
);

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
