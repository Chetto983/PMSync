import React from 'react';
import dynamic from 'next/dynamic';
import { Layout } from '@/components/layout/Layout';
import { Box, Skeleton, Grid } from '@mui/material';
import { PageErrorBoundary } from '@/components/common/ErrorBoundary';

const PipelinesLoadingSkeleton = () => (
  <Box sx={{ p: 3 }}>
    <Skeleton width="30%" height={32} animation="wave" sx={{ mb: 1 }} />
    <Skeleton width="50%" height={20} animation="wave" sx={{ mb: 3 }} />
    <Grid container spacing={2}>
      {Array.from({ length: 3 }).map((_, i) => (
        <Grid key={i} size={{ xs: 12, sm: 6, md: 4 }}>
          <Skeleton variant="rounded" height={140} animation="wave" />
        </Grid>
      ))}
    </Grid>
  </Box>
);

const PipelinesList = dynamic(
  () => import('@/components/dashboard/crm-pipelines/PipelinesList').then(m => ({ default: m.PipelinesList })),
  { ssr: false, loading: () => <PipelinesLoadingSkeleton /> },
);

export default function CrmPipelinesPage() {
  return (
    <Layout>
      <PageErrorBoundary pageName="CRM Pipelines">
        <PipelinesList />
      </PageErrorBoundary>
    </Layout>
  );
}

export const getServerSideProps = async () => {
  return { props: {} };
};
