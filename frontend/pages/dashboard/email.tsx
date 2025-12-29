import React from 'react';
import { Box, Typography } from '@mui/material';
import { Layout } from '@/components/layout/Layout';
import { EmailLayout } from '@/components/email';
import { useTranslations } from '@/lib/hooks/use-translations';
import { Mail } from 'lucide-react';

/**
 * Email Page
 *
 * Phase 2: Folder navigation sidebar with placeholder content.
 * Next phases will add email list and thread views.
 */
export default function EmailPage() {
  const t = useTranslations();

  return (
    <Layout>
      <EmailLayout>
        {/* Placeholder content - will be replaced with email list */}
        <Box
          sx={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            gap: 2,
            p: 3,
          }}
        >
          <Mail size={48} strokeWidth={1.5} />
          <Typography variant="h6" color="text.primary">
            {t.email.title}
          </Typography>
          <Typography variant="body2" color="text.secondary" textAlign="center">
            {t.email.selectEmail}
          </Typography>
        </Box>
      </EmailLayout>
    </Layout>
  );
}

export const getServerSideProps = async () => {
  return { props: {} };
};
