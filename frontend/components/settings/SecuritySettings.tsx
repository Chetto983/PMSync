import React from 'react';
import { Box, Typography } from '@mui/material';
import { useTranslations } from '@/lib/hooks/use-translations';
import { SecurityMfaSection } from './SecurityMfaSection';
import { SecuritySessionsSection } from './SecuritySessionsSection';
import { SecurityAccountsSection } from './SecurityAccountsSection';
import { SecurityPasswordSection } from './SecurityPasswordSection';

export function SecuritySettings() {
  const t = useTranslations();
  const sec = t.settings.securityPanel;

  return (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
        {sec?.title || 'Security'}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
        {sec?.description || 'Manage your account security settings'}
      </Typography>

      <SecurityMfaSection />

      <Box sx={{ mt: 4 }}>
        <SecuritySessionsSection />
      </Box>

      <Box sx={{ mt: 4 }}>
        <SecurityAccountsSection />
      </Box>

      <Box sx={{ mt: 4 }}>
        <SecurityPasswordSection />
      </Box>
    </Box>
  );
}
