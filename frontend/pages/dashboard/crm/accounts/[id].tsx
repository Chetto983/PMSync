import React from 'react';
import dynamic from 'next/dynamic';
import { Layout } from '@/components/layout/Layout';
import { Box, Skeleton } from '@mui/material';
import { PageErrorBoundary } from '@/components/common/ErrorBoundary';

const DetailSkeleton = () => (
  <Box sx={{ p: 3 }}>
    <Skeleton width="40%" height={24} animation="wave" sx={{ mb: 1 }} />
    <Skeleton width="60%" height={36} animation="wave" sx={{ mb: 2 }} />
    <Skeleton width="100%" height={48} animation="wave" sx={{ mb: 2 }} />
    <Skeleton width="100%" height={200} animation="wave" />
  </Box>
);

const AccountDetail = dynamic(
  () =>
    import('@/components/dashboard/crm-accounts/AccountDetail').then((m) => ({
      default: m.AccountDetail,
    })),
  { ssr: false, loading: () => <DetailSkeleton /> },
);

export default function CrmAccountDetailPage() {
  return (
    <Layout>
      <PageErrorBoundary pageName="CRM Account Detail">
        <AccountDetail />
      </PageErrorBoundary>
    </Layout>
  );
}

export const getServerSideProps = async () => {
  return { props: {} };
};
