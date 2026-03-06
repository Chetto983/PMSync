/**
 * DashboardEmptyState - Shown when no widgets are configured
 */

import React from 'react';
import { Box, Typography, Paper, alpha, useTheme, Button } from '@mui/material';
import { LayoutDashboard, Settings } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';

interface DashboardEmptyStateProps {
  onCustomize: () => void;
}

export function DashboardEmptyState({ onCustomize }: DashboardEmptyStateProps) {
  const t = useTranslations();
  const theme = useTheme();

  return (
    <Paper
      elevation={0}
      sx={{
        p: { xs: 4, md: 6 },
        textAlign: 'center',
        borderRadius: 4,
        border: '2px dashed',
        borderColor: alpha(theme.palette.divider, 0.2),
        bgcolor: alpha(theme.palette.background.paper, 0.5),
      }}
    >
      <Box
        sx={{
          width: 80,
          height: 80,
          borderRadius: 4,
          bgcolor: alpha(theme.palette.primary.main, 0.1),
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          mx: 'auto',
          mb: 3,
        }}
      >
        <LayoutDashboard size={40} color={theme.palette.primary.main} />
      </Box>
      <Typography variant="h5" fontWeight={700} gutterBottom>
        {t.dashboard?.empty?.title || 'No widgets selected'}
      </Typography>
      <Typography
        variant="body1"
        color="text.secondary"
        sx={{ mb: 4, maxWidth: 400, mx: 'auto' }}
      >
        {t.dashboard?.empty?.description ||
          'Customize your dashboard by selecting the widgets you want to see'}
      </Typography>
      <Button
        variant="contained"
        size="large"
        startIcon={<Settings size={20} />}
        onClick={onCustomize}
        sx={{
          borderRadius: 3,
          px: 4,
          py: 1.5,
          textTransform: 'none',
          fontWeight: 600,
        }}
      >
        {t.dashboard?.actions?.customize || 'Customize Dashboard'}
      </Button>
    </Paper>
  );
}
