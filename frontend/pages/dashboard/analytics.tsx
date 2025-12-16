
import React from 'react';
import { Layout } from '@/components/layout/Layout';
import { Box, Typography } from '@mui/material';
import { AnalyticsChart } from '@/components/dashboard/AnalyticsChart';
import { PageErrorBoundary } from '@/components/common/ErrorBoundary';

export default function AnalyticsPage() {
  return (
    <Layout>
      <PageErrorBoundary pageName="Analytics">
        <Box>
          <Typography variant="h4" sx={{ mb: 4 }}>Analytics</Typography>
          <AnalyticsChart />
        </Box>
      </PageErrorBoundary>
    </Layout>
  );
}

export const getServerSideProps = async () => {
  return { props: {} };
};
