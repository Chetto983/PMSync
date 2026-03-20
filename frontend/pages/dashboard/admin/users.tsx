import React from 'react';
import { Layout } from '@/components/layout/Layout';
import { UserListTable } from '@/components/admin/UserListTable';
import { PageErrorBoundary } from '@/components/common/ErrorBoundary';
import { authClient, type SessionUser } from '@/lib/auth-client';
import { Box, Typography, Alert } from '@mui/material';
import { PageContainer } from '@/components/common';
import { useTranslations } from '@/lib/hooks/use-translations';

export default function AdminUsersPage() {
  const { data: session, isPending } = authClient.useSession();
  const user = session?.user as SessionUser | undefined;
  const t = useTranslations();

  if (isPending) {
    return (
      <Layout>
        <Box sx={{ p: 4 }}>
          <Typography>{t.common.loading}</Typography>
        </Box>
      </Layout>
    );
  }

  if (!user || user.role !== 'super-admin') {
    return (
      <Layout>
        <Box sx={{ p: 4 }}>
          <Alert severity="warning">
            <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
              Accesso limitato
            </Typography>
            <Typography variant="body2">
              Questa area e riservata ai super-admin. Il tuo account puo continuare a usare il resto della dashboard, ma non ha accesso alla gestione utenti.
            </Typography>
          </Alert>
        </Box>
      </Layout>
    );
  }

  return (
    <Layout>
      <PageErrorBoundary pageName="Admin Users">
        <PageContainer title={t.admin?.users?.title || 'User Management'}>
          <UserListTable />
        </PageContainer>
      </PageErrorBoundary>
    </Layout>
  );
}

export const getServerSideProps = async () => {
  return { props: {} };
};
