import React from 'react';
import dynamic from 'next/dynamic';
import { Layout } from '@/components/layout/Layout';
import { Box, Skeleton } from '@mui/material';
import { PageErrorBoundary } from '@/components/common/ErrorBoundary';

const ContactsLoadingSkeleton = () => (
  <Box sx={{ p: 2 }}>
    {Array.from({ length: 5 }).map((_, i) => (
      <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 1.5 }}>
        <Skeleton variant="circular" width={40} height={40} animation="wave" />
        <Box sx={{ flex: 1 }}>
          <Skeleton width="40%" height={20} animation="wave" />
          <Skeleton width="60%" height={16} animation="wave" sx={{ mt: 0.5 }} />
        </Box>
      </Box>
    ))}
  </Box>
);

const Contacts = dynamic(
  () => import('@/components/dashboard/Contacts').then(m => ({ default: m.Contacts })),
  { ssr: false, loading: () => <ContactsLoadingSkeleton /> },
);

export default function ContactsPage() {
  return (
    <Layout>
      <PageErrorBoundary pageName="Contacts">
        <Contacts />
      </PageErrorBoundary>
    </Layout>
  );
}

export const getServerSideProps = async () => {
  return { props: {} };
};
