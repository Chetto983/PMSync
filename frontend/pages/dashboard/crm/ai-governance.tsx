import React from 'react';
import dynamic from 'next/dynamic';
import { Layout } from '@/components/layout/Layout';
import { Box, Skeleton } from '@mui/material';
import { PageErrorBoundary } from '@/components/common/ErrorBoundary';

const GovernanceLoadingSkeleton = () => (
  <Box sx={{ p: 3 }}>
    <Skeleton width="30%" height={32} animation="wave" sx={{ mb: 1 }} />
    <Skeleton width="50%" height={20} animation="wave" sx={{ mb: 3 }} />
    <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
      {[1, 2, 3, 4].map((i) => (
        <Skeleton key={i} variant="rounded" width="25%" height={80} animation="wave" />
      ))}
    </Box>
    <Skeleton variant="rounded" height={400} animation="wave" />
  </Box>
);

const GovernanceDashboard = dynamic(
  () =>
    import('@/components/dashboard/crm-governance/GovernanceDashboard').then(
      (m) => ({ default: m.GovernanceDashboard }),
    ),
  { ssr: false, loading: () => <GovernanceLoadingSkeleton /> },
);

export default function CrmAiGovernancePage() {
  return (
    <Layout>
      <PageErrorBoundary pageName="CRM AI Governance">
        <GovernanceDashboard />
      </PageErrorBoundary>
    </Layout>
  );
}

export const getServerSideProps = async () => {
  return { props: {} };
};
