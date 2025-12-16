import React from 'react';
import { Layout } from '@/components/layout/Layout';
import { Tasks } from '@/components/dashboard/Tasks';
import { PageErrorBoundary } from '@/components/common/ErrorBoundary';

export default function TasksPage() {
  return (
    <Layout>
      <PageErrorBoundary pageName="Tasks">
        <Tasks />
      </PageErrorBoundary>
    </Layout>
  );
}

export const getServerSideProps = async () => {
  return { props: {} };
};
