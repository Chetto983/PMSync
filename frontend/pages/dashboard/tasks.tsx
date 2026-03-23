import React from 'react';
import Head from 'next/head';
import { Layout } from '@/components/layout/Layout';
import { Tasks } from '@/components/dashboard/Tasks';
import { PageErrorBoundary } from '@/components/common/ErrorBoundary';
import { useTranslations } from '@/lib/hooks/use-translations';

export default function TasksPage() {
  const t = useTranslations();

  return (
    <Layout>
      <Head><title>{t.tasks.title} | PMSync</title></Head>
      <PageErrorBoundary pageName="Tasks">
        <Tasks />
      </PageErrorBoundary>
    </Layout>
  );
}

export const getServerSideProps = async () => {
  return { props: {} };
};
