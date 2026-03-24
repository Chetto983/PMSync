import React from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import { Layout } from '@/components/layout/Layout';
import { Box, Skeleton } from '@mui/material';
import { PageErrorBoundary } from '@/components/common/ErrorBoundary';

const SettingsLoadingSkeleton = () => (
  <Box sx={{ p: 3 }}>
    <Skeleton width="40%" height={24} animation="wave" sx={{ mb: 2 }} />
    <Skeleton width="60%" height={32} animation="wave" sx={{ mb: 1 }} />
    <Skeleton width="100%" height={200} animation="wave" />
  </Box>
);

const PipelineSettings = dynamic(
  () => import('@/components/dashboard/crm-pipelines/PipelineSettings').then(m => ({ default: m.PipelineSettings })),
  { ssr: false, loading: () => <SettingsLoadingSkeleton /> },
);

export default function PipelineSettingsPage() {
  const router = useRouter();
  const { id } = router.query;

  if (!id || typeof id !== 'string') {
    return (
      <Layout>
        <SettingsLoadingSkeleton />
      </Layout>
    );
  }

  return (
    <Layout>
      <PageErrorBoundary pageName="Pipeline Settings">
        <PipelineSettings pipelineId={id} />
      </PageErrorBoundary>
    </Layout>
  );
}

export const getServerSideProps = async () => {
  return { props: {} };
};
