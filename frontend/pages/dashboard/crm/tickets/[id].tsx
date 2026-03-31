import React from 'react';
import dynamic from 'next/dynamic';
import { Layout } from '@/components/layout/Layout';
import { Box, Skeleton } from '@mui/material';
import { PageErrorBoundary } from '@/components/common/ErrorBoundary';

const DetailSkeleton = () => (
  <Box sx={{ p: 3 }}>
    <Skeleton width="20%" height={24} animation="wave" sx={{ mb: 1 }} />
    <Skeleton width="50%" height={36} animation="wave" sx={{ mb: 2 }} />
    <Skeleton width="100%" height={200} animation="wave" />
  </Box>
);

const TicketDetail = dynamic(
  () => import('@/components/dashboard/crm-tickets/TicketDetail').then(m => ({ default: m.TicketDetail })),
  { ssr: false, loading: () => <DetailSkeleton /> },
);

export default function TicketDetailPage() {
  return (
    <Layout>
      <PageErrorBoundary pageName="Ticket Detail">
        <TicketDetail />
      </PageErrorBoundary>
    </Layout>
  );
}

export const getServerSideProps = async () => {
  return { props: {} };
};
