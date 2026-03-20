import React from 'react';
import dynamic from 'next/dynamic';
import { Layout } from '@/components/layout/Layout';
import { Box, Skeleton } from '@mui/material';
import { PageErrorBoundary } from '@/components/common/ErrorBoundary';

const Contacts = dynamic(
  () => import('@/components/dashboard/Contacts').then(m => ({ default: m.Contacts })),
  { ssr: false, loading: () => <Box sx={{ p: 3 }}><Skeleton variant="rounded" height={400} /></Box> },
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
