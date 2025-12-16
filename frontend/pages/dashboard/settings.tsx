import React from 'react';
import { Layout } from '@/components/layout/Layout';
import { Settings } from '@/components/dashboard/Settings';
import { PageErrorBoundary } from '@/components/common/ErrorBoundary';

export default function SettingsPage() {
  return (
    <Layout>
      <PageErrorBoundary pageName="Settings">
        <Settings />
      </PageErrorBoundary>
    </Layout>
  );
}

export const getServerSideProps = async () => {
  return { props: {} };
};
