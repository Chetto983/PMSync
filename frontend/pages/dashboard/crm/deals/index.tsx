import React from 'react';
import dynamic from 'next/dynamic';
import { Layout } from '@/components/layout/Layout';
import { Box, Skeleton } from '@mui/material';
import { PageErrorBoundary } from '@/components/common/ErrorBoundary';

const DealsLoadingSkeleton = () => (
  <Box sx={{ p: 3 }}>
    <Skeleton width="30%" height={32} animation="wave" sx={{ mb: 2 }} />
    <Skeleton width="100%" height={48} animation="wave" sx={{ mb: 1 }} />
    {Array.from({ length: 6 }).map((_, i) => (
      <Skeleton key={i} width="100%" height={40} animation="wave" sx={{ mb: 0.5 }} />
    ))}
  </Box>
);

const DealsList = dynamic(
  () => import('@/components/dashboard/crm-deals/DealsList').then(m => ({ default: m.DealsList })),
  { ssr: false, loading: () => <DealsLoadingSkeleton /> },
);

export default function CrmDealsPage() {
  return (
    <Layout>
      <PageErrorBoundary pageName="CRM Deals">
        <DealsList />
      </PageErrorBoundary>
    </Layout>
  );
}

export const getServerSideProps = async () => {
  return { props: {} };
};
