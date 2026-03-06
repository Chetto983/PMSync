/**
 * AiQuickAccess - AI Assistant quick access panel on the dashboard
 */

import React from 'react';
import { Box, Typography, Paper, alpha, useTheme } from '@mui/material';
import { Sparkles, CheckCircle2 } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';

export function AiQuickAccess() {
  const t = useTranslations();
  const theme = useTheme();

  return (
    <Paper
      component="a"
      href="/dashboard/ai"
      elevation={0}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 2.5,
        px: 3,
        py: 2.5,
        borderRadius: 4,
        border: '1px solid',
        borderColor: alpha(theme.palette.primary.main, 0.2),
        background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.05)} 0%, ${alpha(theme.palette.secondary.main, 0.05)} 100%)`,
        textDecoration: 'none',
        color: 'text.primary',
        transition: 'all 0.25s ease',
        cursor: 'pointer',
        '&:hover': {
          background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.1)} 0%, ${alpha(theme.palette.secondary.main, 0.1)} 100%)`,
          borderColor: alpha(theme.palette.primary.main, 0.4),
          transform: 'translateY(-2px)',
          boxShadow: `0 12px 40px ${alpha(theme.palette.primary.main, 0.2)}`,
        },
      }}
    >
      <Box
        sx={{
          width: 52,
          height: 52,
          borderRadius: 3,
          background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.secondary.main} 100%)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: `0 8px 24px ${alpha(theme.palette.primary.main, 0.35)}`,
        }}
      >
        <Sparkles size={26} color="white" />
      </Box>
      <Box sx={{ flex: 1 }}>
        <Typography variant="h6" fontWeight={700}>
          {t.ai?.title || 'AI Assistant'}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t.ai?.subtitle || 'Ask anything about your emails, calendar & contacts'}
        </Typography>
      </Box>
      <CheckCircle2 size={24} color={theme.palette.success.main} />
    </Paper>
  );
}
