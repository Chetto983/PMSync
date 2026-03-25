import React from 'react';
import dynamic from 'next/dynamic';
import { Box, Skeleton } from '@mui/material';
import { Layout } from '@/components/layout/Layout';
import { PageErrorBoundary } from '@/components/common/ErrorBoundary';

const LoadingSkeleton = () => (
  <Box sx={{ p: 3 }}>
    <Skeleton width="40%" height={24} animation="wave" sx={{ mb: 2 }} />
    <Skeleton width="60%" height={32} animation="wave" sx={{ mb: 1 }} />
    <Skeleton width="100%" height={200} animation="wave" />
  </Box>
);

const CustomFieldsAdmin = dynamic(
  () =>
    import('@/components/dashboard/crm-custom-fields/CustomFieldsAdmin').then(
      (m) => ({ default: m.CustomFieldsAdmin }),
    ),
  { ssr: false, loading: () => <LoadingSkeleton /> },
);

export default function CustomFieldsSettingsPage() {
  return (
    <Layout>
      <PageErrorBoundary pageName="Custom Fields Settings">
        <CustomFieldsAdmin />
      </PageErrorBoundary>
    </Layout>
  );
}

export const getServerSideProps = async () => {
  return { props: {} };
};
