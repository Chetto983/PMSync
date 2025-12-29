import React from 'react';
import { Box, Typography } from '@mui/material';
import { Layout } from '@/components/layout/Layout';
import { Mail } from 'lucide-react';

/**
 * Email Page - Placeholder during rebuild
 *
 * Will be rebuilt step by step with clean Outlook/Superhuman design
 */
export default function EmailPage() {
  return (
    <Layout>
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          gap: 2,
        }}
      >
        <Mail size={64} strokeWidth={1.5} />
        <Typography variant="h5">Email Module Rebuilding</Typography>
        <Typography variant="body2" color="text.secondary">
          Clean Outlook/Superhuman design coming soon
        </Typography>
      </Box>
    </Layout>
  );
}

export const getServerSideProps = async () => {
  return { props: {} };
};
