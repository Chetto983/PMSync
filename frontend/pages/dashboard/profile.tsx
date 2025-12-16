
import React from 'react';
import { Layout } from '@/components/layout/Layout';
import { Box, Typography } from '@mui/material';
import { ProfileSettings } from '@/components/dashboard/ProfileSettings';
import { PageErrorBoundary } from '@/components/common/ErrorBoundary';

export default function ProfilePage() {
  return (
    <Layout>
      <PageErrorBoundary pageName="Profile">
        <Box>
          <Typography variant="h4" sx={{ mb: 4 }}>User Profile</Typography>
          <ProfileSettings />
        </Box>
      </PageErrorBoundary>
    </Layout>
  );
}

export const getServerSideProps = async () => {
  return { props: {} };
};
