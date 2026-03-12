import React from 'react';
import { Layout } from '@/components/layout/Layout';
import { OrgAdminPage } from '@/components/organizations/OrgAdminPage';
import { PageErrorBoundary } from '@/components/common/ErrorBoundary';
import { authClient, type SessionUser } from '@/lib/auth-client';
import { Box, Typography, Alert } from '@mui/material';
import { useTranslations } from '@/lib/hooks/use-translations';

export default function OrganizationsPage() {
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
              Questa area e riservata ai super-admin. Se devi gestire organizzazioni, usa un account con privilegi adeguati oppure contatta l amministratore del workspace.
            </Typography>
          </Alert>
        </Box>
      </Layout>
    );
  }

  return (
    <Layout>
      <PageErrorBoundary pageName="Organizations">
        <OrgAdminPage />
      </PageErrorBoundary>
    </Layout>
  );
}

export const getServerSideProps = async () => {
  return { props: {} };
};
