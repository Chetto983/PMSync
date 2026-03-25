import React from 'react';
import dynamic from 'next/dynamic';
import { Layout } from '@/components/layout/Layout';
import { Box, Skeleton } from '@mui/material';
import { PageErrorBoundary } from '@/components/common/ErrorBoundary';

const DealDetailSkeleton = () => (
  <Box sx={{ p: 3 }}>
    <Skeleton width="40%" height={24} sx={{ mb: 1 }} />
    <Skeleton width="60%" height={36} sx={{ mb: 2 }} />
    <Skeleton width="100%" height={48} sx={{ mb: 2 }} />
    <Skeleton width="100%" height={200} />
  </Box>
);

const DealDetail = dynamic(
  () => import('@/components/dashboard/crm-deals/DealDetail').then(m => ({ default: m.DealDetail })),
  { ssr: false, loading: () => <DealDetailSkeleton /> },
);

export default function CrmDealDetailPage() {
  return (
    <Layout>
      <PageErrorBoundary pageName="Deal Detail">
        <DealDetail />
      </PageErrorBoundary>
    </Layout>
  );
}

export const getServerSideProps = async () => {
  return { props: {} };
};
