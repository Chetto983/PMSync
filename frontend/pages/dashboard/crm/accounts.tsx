import React from 'react';
import dynamic from 'next/dynamic';
import { Layout } from '@/components/layout/Layout';
import { Box, Skeleton } from '@mui/material';
import { PageErrorBoundary } from '@/components/common/ErrorBoundary';

const AccountsLoadingSkeleton = () => (
  <Box sx={{ p: 3 }}>
    <Skeleton width="30%" height={32} animation="wave" sx={{ mb: 2 }} />
    <Skeleton width="100%" height={48} animation="wave" sx={{ mb: 1 }} />
    {Array.from({ length: 6 }).map((_, i) => (
      <Skeleton key={i} width="100%" height={40} animation="wave" sx={{ mb: 0.5 }} />
    ))}
  </Box>
);

const AccountsList = dynamic(
  () => import('@/components/dashboard/crm-accounts/AccountsList').then(m => ({ default: m.AccountsList })),
  { ssr: false, loading: () => <AccountsLoadingSkeleton /> },
);

export default function CrmAccountsPage() {
  return (
    <Layout>
      <PageErrorBoundary pageName="CRM Accounts">
        <AccountsList />
      </PageErrorBoundary>
    </Layout>
  );
}

export const getServerSideProps = async () => {
  return { props: {} };
};
