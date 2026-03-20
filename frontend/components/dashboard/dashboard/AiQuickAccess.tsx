/**
 * AiQuickAccess - AI Assistant quick access panel on the dashboard
 */

import React from 'react';
import { Box, Typography, Card, alpha, useTheme } from '@mui/material';
import { Sparkles } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';

export function AiQuickAccess() {
  const t = useTranslations();
  const theme = useTheme();

  return (
    <Card
      component="a"
      href="/dashboard/ai"
      variant="outlined"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        px: 2.5,
        py: 2,
        textDecoration: 'none',
        color: 'text.primary',
        cursor: 'pointer',
        transition: 'border-color 0.15s ease',
        '&:hover': {
          borderColor: theme.palette.primary.main,
        },
      }}
    >
      <Box
        sx={{
          width: 40,
          height: 40,
          borderRadius: 2,
          bgcolor: alpha(theme.palette.primary.main, 0.1),
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'primary.main',
          flexShrink: 0,
        }}
      >
        <Sparkles size={20} />
      </Box>
      <Box sx={{ flex: 1 }}>
        <Typography variant="subtitle2" fontWeight={700}>
          {t.ai?.title || 'AI Assistant'}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {t.ai?.subtitle || 'Ask anything about your emails, calendar & contacts'}
        </Typography>
      </Box>
    </Card>
  );
}
