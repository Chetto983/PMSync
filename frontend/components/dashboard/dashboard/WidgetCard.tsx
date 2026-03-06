/**
 * WidgetCard - Glassmorphism card wrapper for dashboard widgets
 */

import React from 'react';
import { Paper, alpha, useTheme } from '@mui/material';

interface WidgetCardProps {
  children: React.ReactNode;
  fullWidth?: boolean;
}

export function WidgetCard({ children, fullWidth = false }: WidgetCardProps) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  return (
    <Paper
      elevation={0}
      sx={{
        gridColumn: fullWidth ? '1 / -1' : 'auto',
        borderRadius: 4,
        border: '1px solid',
        borderColor: alpha(theme.palette.divider, isDark ? 0.15 : 0.1),
        bgcolor: alpha(theme.palette.background.paper, isDark ? 0.8 : 0.95),
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        boxShadow: isDark
          ? `0 4px 30px ${alpha('#000', 0.15)}`
          : `0 4px 30px ${alpha(theme.palette.grey[500], 0.08)}`,
        overflow: 'hidden',
        minHeight: 200,
        transition: 'all 0.25s ease',
        '&:hover': {
          boxShadow: isDark
            ? `0 8px 40px ${alpha('#000', 0.25)}`
            : `0 8px 40px ${alpha(theme.palette.primary.main, 0.12)}`,
          borderColor: alpha(theme.palette.primary.main, 0.25),
        },
      }}
    >
      {children}
    </Paper>
  );
}
