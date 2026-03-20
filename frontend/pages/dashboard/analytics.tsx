
import React from 'react';
import dynamic from 'next/dynamic';
import { Layout } from '@/components/layout/Layout';
import { Skeleton } from '@mui/material';
import { PageErrorBoundary } from '@/components/common/ErrorBoundary';
import { PageContainer } from '@/components/common';
import { useTranslations } from '@/lib/hooks/use-translations';

const AnalyticsChart = dynamic(
  () => import('@/components/dashboard/AnalyticsChart').then(m => ({ default: m.AnalyticsChart })),
  { ssr: false, loading: () => <Skeleton variant="rounded" height={400} /> },
);

export default function AnalyticsPage() {
  const t = useTranslations();

  return (
    <Layout>
      <PageErrorBoundary pageName="Analytics">
        <PageContainer title={t.nav.analytics}>
          <AnalyticsChart />
        </PageContainer>
      </PageErrorBoundary>
    </Layout>
  );
}

export const getServerSideProps = async () => {
  return { props: {} };
};
