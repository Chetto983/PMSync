import React from 'react';
import { useRouter } from 'next/router';
import { Box } from '@mui/material';
import { Layout } from '@/components/layout/Layout';
import { Mailbox } from '@/components/dashboard/Mailbox';
import { PageErrorBoundary } from '@/components/common/ErrorBoundary';

/**
 * Email Page - Dedicated full-screen email management interface
 *
 * Full-featured email client with:
 * - Folder navigation
 * - Email list with search and filters
 * - Email detail view
 * - Compose functionality
 * - Bulk actions
 * - Uses shared Layout for consistent theming
 */
export default function EmailPage() {
  const router = useRouter();

  // Read query parameters from URL
  const searchQuery = typeof router.query.search === 'string' ? router.query.search : undefined;
  const emailId = typeof router.query.id === 'string' ? router.query.id : undefined;

  return (
    <Layout>
      <PageErrorBoundary pageName="Email">
        <Box
          sx={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            height: '100%',
            minHeight: 0,
            minWidth: 0, // Critical: allows flex item to shrink below content size
          }}
        >
          <Mailbox initialSearchQuery={searchQuery} initialEmailId={emailId} />
        </Box>
      </PageErrorBoundary>
    </Layout>
  );
}

// Force SSR to avoid NextRouter SSR errors
export const getServerSideProps = async () => {
  return { props: {} };
};
