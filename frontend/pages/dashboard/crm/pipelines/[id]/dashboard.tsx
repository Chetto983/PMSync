import React from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import { Layout } from '@/components/layout/Layout';
import { Box, Skeleton, Grid } from '@mui/material';
import { PageErrorBoundary } from '@/components/common/ErrorBoundary';

const DashboardLoadingSkeleton = () => (
  <Box sx={{ p: 3 }}>
    <Skeleton width="40%" height={24} animation="wave" sx={{ mb: 2 }} />
    <Skeleton width="60%" height={32} animation="wave" sx={{ mb: 3 }} />
    <Grid container spacing={2} sx={{ mb: 3 }}>
      {Array.from({ length: 6 }).map((_, i) => (
        <Grid key={i} size={{ xs: 12, sm: 6, md: 4 }}>
          <Skeleton variant="rounded" height={120} animation="wave" />
        </Grid>
      ))}
    </Grid>
  </Box>
);

const PipelineDashboard = dynamic(
  () => import('@/components/dashboard/crm-pipelines/PipelineDashboard').then(m => ({ default: m.PipelineDashboard })),
  { ssr: false, loading: () => <DashboardLoadingSkeleton /> },
);

export default function PipelineDashboardPage() {
  const router = useRouter();
  const { id } = router.query;

  if (!id || typeof id !== 'string') {
    return (
      <Layout>
        <DashboardLoadingSkeleton />
      </Layout>
    );
  }

  return (
    <Layout>
      <PageErrorBoundary pageName="Pipeline Dashboard">
        <PipelineDashboard pipelineId={id} />
      </PageErrorBoundary>
    </Layout>
  );
}

export const getServerSideProps = async () => {
  return { props: {} };
};
