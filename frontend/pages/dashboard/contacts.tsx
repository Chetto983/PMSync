import React from 'react';
import { Layout } from '@/components/layout/Layout';
import { Contacts } from '@/components/dashboard/Contacts';
import { PageErrorBoundary } from '@/components/common/ErrorBoundary';

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
