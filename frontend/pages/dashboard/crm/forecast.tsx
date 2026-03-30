import React from 'react';
import dynamic from 'next/dynamic';
import { Layout } from '@/components/layout/Layout';
import { Box, Skeleton } from '@mui/material';
import { PageErrorBoundary } from '@/components/common/ErrorBoundary';

const ForecastLoadingSkeleton = () => (
  <Box sx={{ p: 3 }}>
    <Skeleton width="30%" height={32} animation="wave" sx={{ mb: 1 }} />
    <Skeleton width="50%" height={20} animation="wave" sx={{ mb: 3 }} />
    <Skeleton variant="rounded" height={400} animation="wave" />
  </Box>
);

const ForecastDashboard = dynamic(
  () =>
    import('@/components/dashboard/crm-forecast/ForecastDashboard').then((m) => ({
      default: m.ForecastDashboard,
    })),
  { ssr: false, loading: () => <ForecastLoadingSkeleton /> },
);

export default function CrmForecastPage() {
  return (
    <Layout>
      <PageErrorBoundary pageName="CRM Forecast">
        <ForecastDashboard />
      </PageErrorBoundary>
    </Layout>
  );
}

export const getServerSideProps = async () => {
  return { props: {} };
};
