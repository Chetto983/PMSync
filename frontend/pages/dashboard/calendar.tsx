import React from 'react';
import { Layout } from '@/components/layout/Layout';
import { Calendar } from '@/components/dashboard/Calendar';
import { PageErrorBoundary } from '@/components/common/ErrorBoundary';

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
