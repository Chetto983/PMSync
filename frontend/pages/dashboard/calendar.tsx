import React from 'react';
import dynamic from 'next/dynamic';
import { Layout } from '@/components/layout/Layout';
import { Skeleton } from '@mui/material';
import { PageErrorBoundary } from '@/components/common/ErrorBoundary';

const Calendar = dynamic(
  () => import('@/components/dashboard/Calendar').then(m => ({ default: m.Calendar })),
  { ssr: false, loading: () => <Skeleton variant="rounded" height={600} /> },
);

/**
 * Calendar Page
 *
 * Modern calendar interface with monthly grid view
 */
export default function CalendarPage() {
  return (
    <Layout>
      <PageErrorBoundary pageName="Calendar">
        <Calendar />
      </PageErrorBoundary>
    </Layout>
  );
}

// Force SSR to avoid NextRouter SSR errors
export const getServerSideProps = async () => {
  return { props: {} };
};
