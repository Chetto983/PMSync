import React from 'react';
import { Layout } from '@/components/layout/Layout';
import { UserListTable } from '@/components/admin/UserListTable';
import { PageErrorBoundary } from '@/components/common/ErrorBoundary';
import { authClient, type SessionUser } from '@/lib/auth-client';
import { Box, Typography, Alert } from '@mui/material';
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
          <Alert severity="error">
            {t.common.genericError || 'Access denied'}
          </Alert>
        </Box>
      </Layout>
    );
  }

  return (
    <Layout>
      <PageErrorBoundary pageName="Admin Users">
        <Box sx={{ p: 3 }}>
          <UserListTable />
        </Box>
      </PageErrorBoundary>
    </Layout>
  );
}

export const getServerSideProps = async () => {
  return { props: {} };
};
