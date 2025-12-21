/**
 * AI Memory Browser Page
 *
 * Allows users to explore, search, add, and manage AI memories.
 * Phase 7: CRM & Memory Features (FRONTEND_ROADMAP_2025.md)
 */

import React, { useEffect } from 'react';
import { useRouter } from 'next/router';
import { Box, CircularProgress, Typography, Container } from '@mui/material';
import { useAuth } from '@/lib/hooks/use-auth';
import { Layout } from '@/components/layout/Layout';
import { MemoryBrowser } from '@/components/ai/MemoryBrowser';
import { PageErrorBoundary } from '@/components/common/ErrorBoundary';

export default function MemoriesPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/auth/login');
    }
  }, [user, isLoading, router]);

  if (isLoading) {
    return (
      <Box
        sx={{
          display: 'flex',
          minHeight: '100vh',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: 'background.default',
        }}
      >
        <Box sx={{ textAlign: 'center' }}>
          <Box sx={{ mb: 2, display: 'flex', justifyContent: 'center' }}>
            <CircularProgress size={40} />
          </Box>
          <Typography variant="body1" color="text.primary">
            Loading...
          </Typography>
        </Box>
      </Box>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <Layout>
      <PageErrorBoundary pageName="AI Memory Browser">
        <Box sx={{ py: 3, px: { xs: 2, md: 3 } }}>
          <Container maxWidth="lg" disableGutters>
            <MemoryBrowser />
          </Container>
        </Box>
      </PageErrorBoundary>
    </Layout>
  );
}

// Force SSR to avoid NextRouter SSR errors
export const getServerSideProps = async () => {
  return { props: {} };
};
