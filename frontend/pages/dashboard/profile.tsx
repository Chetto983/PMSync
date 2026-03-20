
import React from 'react';
import { Layout } from '@/components/layout/Layout';
import { ProfileSettings } from '@/components/dashboard/ProfileSettings';
import { PageErrorBoundary } from '@/components/common/ErrorBoundary';
import { PageContainer } from '@/components/common';
import { useTranslations } from '@/lib/hooks/use-translations';

export default function ProfilePage() {
  const t = useTranslations();

  return (
    <Layout>
      <PageErrorBoundary pageName="Profile">
        <PageContainer title={t.settings?.profileTitle || 'Profile'}>
          <ProfileSettings />
        </PageContainer>
      </PageErrorBoundary>
    </Layout>
  );
}

export const getServerSideProps = async () => {
  return { props: {} };
};
