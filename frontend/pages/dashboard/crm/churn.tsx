import React from 'react';
import dynamic from 'next/dynamic';
import { Layout } from '@/components/layout/Layout';
import { Box, Skeleton } from '@mui/material';
import { PageErrorBoundary } from '@/components/common/ErrorBoundary';

const ChurnLoadingSkeleton = () => (
  <Box sx={{ p: 3 }}>
    <Skeleton width="30%" height={32} animation="wave" sx={{ mb: 1 }} />
    <Skeleton width="50%" height={20} animation="wave" sx={{ mb: 3 }} />
    <Skeleton variant="rounded" height={400} animation="wave" />
  </Box>
);

const ChurnWarningsList = dynamic(
  () =>
    import('@/components/dashboard/crm-churn/ChurnWarningsList').then((m) => ({
      default: m.ChurnWarningsList,
    })),
  { ssr: false, loading: () => <ChurnLoadingSkeleton /> },
);

export default function CrmChurnPage() {
  return (
    <Layout>
      <PageErrorBoundary pageName="CRM Churn Warnings">
        <ChurnWarningsList />
      </PageErrorBoundary>
    </Layout>
  );
}

export const getServerSideProps = async () => {
  return { props: {} };
};
